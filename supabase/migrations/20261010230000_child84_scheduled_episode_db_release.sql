-- Child84: proposed scheduled episode release; reviewed Draft only.
-- Never apply to Production before explicit review/approval and restore gates.
-- The existing public SELECT RLS, Reader, Work and summary view only admit
-- episodes posting_status='posted' AND is_published=true. No policy widening.
--
-- Supabase Cron is a Postgres extension. This migration activates a
-- once-per-minute transition only when explicitly applied in the target DB.
create extension if not exists pg_cron;

-- Private-to-the-database audit: IDs and batch counts are NEVER public data.
-- Only the privileged cron migration role can insert/read this table.
create table if not exists public.libread_scheduled_episode_release_audit (
  id bigint generated always as identity primary key,
  released_at timestamptz not null default now(),
  released_count integer not null check (released_count > 0 and released_count <= 200),
  episode_ids uuid[] not null,
  constraint libread_scheduled_episode_release_audit_count_check
    check (cardinality(episode_ids) = released_count)
);
alter table public.libread_scheduled_episode_release_audit enable row level security;
revoke all on table public.libread_scheduled_episode_release_audit
  from public, anon, authenticated;
revoke all on sequence public.libread_scheduled_episode_release_audit_id_seq
  from public, anon, authenticated;

-- The name is fixed and versioned; a replay replaces this job rather than
-- creating another independent release loop.
-- Both the UPDATE and the audit INSERT are one PostgreSQL statement and
-- transaction; an audit failure rolls the release back.
select cron.schedule(
  'libread-scheduled-episode-release-v1',
  '* * * * *',
  $job$
    with ready as (
      select e.id
      from public.episodes e
      where e.posting_status = 'scheduled'
        and e.is_published = false
        and e.scheduled_for <= now()
        -- Do not jump over a draft/future preceding episode. The previous
        -- episode may be released in this batch; the next run will advance.
        and not exists (
          select 1
          from public.episodes previous
          where previous.id = (
            -- Episode numbering can contain gaps. Compare with the most
            -- recent EXISTING preceding row, not episode_number - 1.
            select prior.id
            from public.episodes prior
            where prior.series_id = e.series_id
              and prior.episode_number < e.episode_number
            order by prior.episode_number desc, prior.id desc
            limit 1
          )
            and (
              previous.posting_status <> 'posted'
              or previous.is_published is distinct from true
            )
        )
      order by e.scheduled_for asc, e.id asc
      limit 200
      for update of e skip locked
    ),
    released as (
      update public.episodes e
      set posting_status = 'posted',
          is_published = true,
          posted_at = coalesce(e.posted_at, e.scheduled_for),
          scheduled_for = null
      from ready
      where e.id = ready.id
      returning e.id
    )
    insert into public.libread_scheduled_episode_release_audit
      (released_count, episode_ids)
    select count(*)::integer, array_agg(id order by id)
    from released
    having count(*) > 0;
  $job$
);

-- On an explicitly approved rollback: select cron.unschedule('libread-scheduled-episode-release-v1');
-- Never drop posted story content or the audit table as part of rollback.
