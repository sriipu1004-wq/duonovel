create table if not exists public.user_recording_consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_key text not null,
  consent_version text not null,
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, consent_key)
);

create index if not exists user_recording_consents_key_version_idx
  on public.user_recording_consents (consent_key, consent_version);

comment on table public.user_recording_consents is
  'Stores one-time user consents for recording/publish related interstitials.';

comment on column public.user_recording_consents.consent_key is
  'Logical consent identifier. Example: human_recording_publish';

comment on column public.user_recording_consents.consent_version is
  'Current consent version accepted by the user. Re-show interstitial when this changes.';

alter table public.user_recording_consents enable row level security;

drop policy if exists "user_recording_consents_select_own" on public.user_recording_consents;
create policy "user_recording_consents_select_own"
  on public.user_recording_consents
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_recording_consents_insert_own" on public.user_recording_consents;
create policy "user_recording_consents_insert_own"
  on public.user_recording_consents
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_recording_consents_update_own" on public.user_recording_consents;
create policy "user_recording_consents_update_own"
  on public.user_recording_consents
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);