alter table public.series
add column if not exists recording_permission_mode text;

update public.series
set recording_permission_mode = 'closed'
where recording_permission_mode is null;

alter table public.series
alter column recording_permission_mode set default 'closed';

update public.series
set recording_permission_mode = 'closed'
where recording_permission_mode is null;

alter table public.series
alter column recording_permission_mode set not null;

alter table public.series
drop constraint if exists series_recording_permission_mode_check;

alter table public.series
add constraint series_recording_permission_mode_check
check (
  recording_permission_mode in ('open', 'closed', 'approval_required')
);

comment on column public.series.recording_permission_mode is
  'Canonical source for third-party recording permission per series. open, closed, or approval_required.';