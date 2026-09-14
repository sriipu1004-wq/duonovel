// These fields are the canonical public `recordings` schema. Keep this list
// separate from compatibility readers: PostgREST rejects an entire select when
// even one historical column name is absent.
export const PUBLIC_RECORDING_AGGREGATE_SELECT = `
  id,
  series_id,
  like_count,
  play_count,
  is_public
`;

export const PUBLIC_WORK_RECORDING_SELECT = `
  id,
  series_id,
  reader_id,
  reader_user_id,
  reader_name,
  tags,
  like_count,
  play_count,
  is_public,
  allow_download,
  episode_id,
  audio_storage_path,
  voice_model_id,
  created_at,
  voice_models (
    display_name,
    name,
    tags
  )
`;
