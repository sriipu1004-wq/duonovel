import type { SupabaseClient } from '@supabase/supabase-js'

export type PlayLogRow = {
  id: string
  user_id: string
  series_id: string
  episode_id: string
  episode_number: number
  recording_id: string | null
  position_seconds: number
  marker_index: number
  progress_percent: number
  is_following: boolean
  last_played_at: string
  created_at: string
  updated_at: string
}

export type GetPlayLogBySeriesParams = {
  userId: string | null | undefined
  seriesId: string
}

export type SavePlayLogInput = {
  userId: string | null | undefined
  seriesId: string
  episodeId: string
  episodeNumber: number
  recordingId?: string | null
  positionSeconds: number
  markerIndex?: number
  progressPercent?: number
  isFollowing?: boolean
}

export type PlayLogResult = {
  data: PlayLogRow | null
  error: unknown
  skipped: boolean
}

export type DeletePlayLogResult = {
  error: unknown
  skipped: boolean
}

export type PlayLogResumeState = {
  episodeId: string
  episodeNumber: number
  recordingId: string | null
  positionSeconds: number
  markerIndex: number
  progressPercent: number
  isFollowing: boolean
  lastPlayedAt: string
}

const PLAY_LOG_SELECT = `
  id,
  user_id,
  series_id,
  episode_id,
  episode_number,
  recording_id,
  position_seconds,
  marker_index,
  progress_percent,
  is_following,
  last_played_at,
  created_at,
  updated_at
`

function toNonNegativeNumber(value: number | undefined, fallback = 0) {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback
  }

  return value < 0 ? 0 : value
}

function clampProgressPercent(value: number | undefined) {
  const safe = toNonNegativeNumber(value, 0)

  if (safe > 100) {
    return 100
  }

  return Math.round(safe * 100) / 100
}

function normalizeEpisodeNumber(value: number) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('episodeNumber must be a positive integer')
  }

  return value
}

function roundPositionSeconds(value: number) {
  const safe = toNonNegativeNumber(value, 0)
  return Math.round(safe * 1000) / 1000
}

function normalizeMarkerIndex(value: number | undefined) {
  return Math.floor(toNonNegativeNumber(value, 0))
}

export function toPlayLogResumeState(playLog: PlayLogRow | null): PlayLogResumeState | null {
  if (!playLog) {
    return null
  }

  return {
    episodeId: playLog.episode_id,
    episodeNumber: playLog.episode_number,
    recordingId: playLog.recording_id,
    positionSeconds: playLog.position_seconds,
    markerIndex: playLog.marker_index,
    progressPercent: playLog.progress_percent,
    isFollowing: playLog.is_following,
    lastPlayedAt: playLog.last_played_at,
  }
}

export async function getPlayLogBySeries(
  supabase: SupabaseClient,
  params: GetPlayLogBySeriesParams,
): Promise<PlayLogResult> {
  const { userId, seriesId } = params

  if (!userId) {
    return {
      data: null,
      error: null,
      skipped: true,
    }
  }

  if (!seriesId) {
    return {
      data: null,
      error: new Error('seriesId is required'),
      skipped: false,
    }
  }

  const { data, error } = await supabase
    .from('play_logs')
    .select(PLAY_LOG_SELECT)
    .eq('user_id', userId)
    .eq('series_id', seriesId)
    .maybeSingle()

  return {
    data: (data as PlayLogRow | null) ?? null,
    error,
    skipped: false,
  }
}

export async function savePlayLog(
  supabase: SupabaseClient,
  input: SavePlayLogInput,
): Promise<PlayLogResult> {
  const {
    userId,
    seriesId,
    episodeId,
    episodeNumber,
    recordingId = null,
    positionSeconds,
    markerIndex = 0,
    progressPercent = 0,
    isFollowing = true,
  } = input

  if (!userId) {
    return {
      data: null,
      error: null,
      skipped: true,
    }
  }

  if (!seriesId) {
    return {
      data: null,
      error: new Error('seriesId is required'),
      skipped: false,
    }
  }

  if (!episodeId) {
    return {
      data: null,
      error: new Error('episodeId is required'),
      skipped: false,
    }
  }

  const payload = {
    user_id: userId,
    series_id: seriesId,
    episode_id: episodeId,
    episode_number: normalizeEpisodeNumber(episodeNumber),
    recording_id: recordingId,
    position_seconds: roundPositionSeconds(positionSeconds),
    marker_index: normalizeMarkerIndex(markerIndex),
    progress_percent: clampProgressPercent(progressPercent),
    is_following: Boolean(isFollowing),
    last_played_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('play_logs')
    .upsert(payload, {
      onConflict: 'user_id,series_id',
    })
    .select(PLAY_LOG_SELECT)
    .single()

  return {
    data: (data as PlayLogRow | null) ?? null,
    error,
    skipped: false,
  }
}

export async function deletePlayLogBySeries(
  supabase: SupabaseClient,
  params: GetPlayLogBySeriesParams,
): Promise<DeletePlayLogResult> {
  const { userId, seriesId } = params

  if (!userId) {
    return {
      error: null,
      skipped: true,
    }
  }

  if (!seriesId) {
    return {
      error: new Error('seriesId is required'),
      skipped: false,
    }
  }

  const { error } = await supabase
    .from('play_logs')
    .delete()
    .eq('user_id', userId)
    .eq('series_id', seriesId)

  return {
    error,
    skipped: false,
  }
}