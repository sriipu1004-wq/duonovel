create table if not exists public.series_recording_requests (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  requester_user_id uuid not null,
  status text not null default 'pending',
  request_message text not null default '',
  review_message text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by_user_id uuid null
);

alter table public.series_recording_requests
drop constraint if exists series_recording_requests_status_check;

alter table public.series_recording_requests
add constraint series_recording_requests_status_check
check (
  status in ('pending', 'approved', 'rejected', 'cancelled')
);

create index if not exists series_recording_requests_series_id_idx
  on public.series_recording_requests (series_id);

create index if not exists series_recording_requests_requester_user_id_idx
  on public.series_recording_requests (requester_user_id);

create index if not exists series_recording_requests_status_idx
  on public.series_recording_requests (status);

create unique index if not exists series_recording_requests_one_pending_per_user_idx
  on public.series_recording_requests (series_id, requester_user_id)
  where status = 'pending';

comment on table public.series_recording_requests is
  'Per-series recording approval requests for third-party narrators.';

comment on column public.series_recording_requests.series_id is
  'Target series for the recording request.';

comment on column public.series_recording_requests.requester_user_id is
  'Authenticated user who submitted the request.';

comment on column public.series_recording_requests.status is
  'Request state: pending, approved, rejected, or cancelled.';

comment on column public.series_recording_requests.request_message is
  'Optional message from requester when asking for approval.';

comment on column public.series_recording_requests.review_message is
  'Optional message from author when approving or rejecting.';

comment on column public.series_recording_requests.reviewed_by_user_id is
  'User id of the reviewer. Kept as uuid only for now until reader identity design is finalized.';

alter table public.series_recording_requests enable row level security;

drop policy if exists "series_recording_requests_select_own" on public.series_recording_requests;
create policy "series_recording_requests_select_own"
on public.series_recording_requests
for select
to authenticated
using (
  requester_user_id = auth.uid()
);

drop policy if exists "series_recording_requests_insert_own_pending" on public.series_recording_requests;
create policy "series_recording_requests_insert_own_pending"
on public.series_recording_requests
for insert
to authenticated
with check (
  requester_user_id = auth.uid()
  and status = 'pending'
);

drop policy if exists "series_recording_requests_select_owned_series" on public.series_recording_requests;
create policy "series_recording_requests_select_owned_series"
on public.series_recording_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.series
    where public.series.id = public.series_recording_requests.series_id
      and public.series.author_id = auth.uid()
  )
);

drop policy if exists "series_recording_requests_update_owned_series" on public.series_recording_requests;
create policy "series_recording_requests_update_owned_series"
on public.series_recording_requests
for update
to authenticated
using (
  exists (
    select 1
    from public.series
    where public.series.id = public.series_recording_requests.series_id
      and public.series.author_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.series
    where public.series.id = public.series_recording_requests.series_id
      and public.series.author_id = auth.uid()
  )
);
