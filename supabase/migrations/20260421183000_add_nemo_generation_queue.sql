create table if not exists public.nemo_generation_queue (
  id uuid primary key default gen_random_uuid(),
  series_id text not null,
  episode_id text not null,
  generation_status text not null default 'pending',
  generation_reason text not null default 'missing_recording',
  is_stale boolean not null default false,
  source_text_hash text,
  priority_score integer not null default 0,
  viewer_count_snapshot integer not null default 0,
  request_count integer not null default 0,
  last_request_source text not null default 'system',
  last_requested_by_user_id text,
  first_requested_at timestamptz not null default timezone('utc', now()),
  last_requested_at timestamptz not null default timezone('utc', now()),
  last_attempted_at timestamptz,
  last_generated_at timestamptz,
  last_error text,
  attempt_count integer not null default 0,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  constraint nemo_generation_queue_episode_id_key unique (episode_id),
  constraint nemo_generation_queue_generation_status_check check (
    generation_status in ('pending', 'processing', 'completed', 'failed')
  ),
  constraint nemo_generation_queue_generation_reason_check check (
    generation_reason in (
      'missing_recording',
      'source_changed',
      'manual_request',
      'manual_generate',
      'backfill'
    )
  )
);

create index if not exists nemo_generation_queue_claim_idx
  on public.nemo_generation_queue (
    generation_status,
    priority_score desc,
    viewer_count_snapshot desc,
    last_requested_at desc,
    first_requested_at asc
  );

create index if not exists nemo_generation_queue_series_idx
  on public.nemo_generation_queue (series_id);

comment on table public.nemo_generation_queue is
  'Persistent per-episode queue/state for official Nemo auto generation. Stores pending/stale/completed status, request recency, and worker claim state before moving to dedicated workers.';

comment on column public.nemo_generation_queue.generation_status is
  'Current queue state. pending=waiting, processing=claimed by worker, completed=latest known source covered, failed=last run errored.';

comment on column public.nemo_generation_queue.generation_reason is
  'Why the episode is in this state. missing_recording and source_changed are the main operational reasons for queued regeneration.';

comment on column public.nemo_generation_queue.source_text_hash is
  'SHA-256 hash of the Nemo preprocessed spoken-text chunks used to decide whether the latest known generation source changed.';

comment on column public.nemo_generation_queue.priority_score is
  'Operational priority. Higher first. Intended to combine active-viewer urgency, missing/stale state, and manual boosts.';

comment on column public.nemo_generation_queue.viewer_count_snapshot is
  'Latest caller-provided viewer/open count snapshot used when calculating queue priority.';

comment on column public.nemo_generation_queue.last_request_source is
  'Last ingress source that touched this queue row, e.g. admin_autogen, manual_generate, future public touch, or background backfill.';

comment on column public.nemo_generation_queue.locked_at is
  'Timestamp when a worker claimed the row. Used for future stale-lock recovery when dedicated workers are introduced.';