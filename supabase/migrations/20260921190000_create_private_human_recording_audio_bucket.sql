-- Human narration must not share the public synthetic/TTS audio bucket.
-- All browser access is mediated by /api/recordings/human-audio/[recordingId].
insert into storage.buckets (id, name, public)
values ('human-recording-audio', 'human-recording-audio', false)
on conflict (id) do update
set public = false;
