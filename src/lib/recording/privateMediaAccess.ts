// Issue #137 PR-E: pure request-time authorization for PRIVATE media playback.
//
// The source visibility rule mirrors the Reader (src/lib/publicRead.ts):
//   - a non-public series is readable only by its owner;
//   - a non-public episode (isEpisodePubliclyVisible false) is readable only
//     by the series owner;
//   - an R18 series needs the CURRENT viewer's showR18Content preference,
//     owners included (the Reader returns r18Blocked for them too).
// Inputs must come from fresh server-side reads on every request.

export type ReaderSourceSnapshot = Readonly<{
  seriesPublic: boolean;
  episodePublic: boolean;
  /** episode.series_id equals the recording's series_id */
  episodeBelongsToSeries: boolean;
  viewerIsSeriesOwner: boolean;
  isR18: boolean;
  viewerShowsR18: boolean;
}>;

export function canViewReaderSource(s: ReaderSourceSnapshot): boolean {
  if (s.episodeBelongsToSeries !== true) return false;
  const readable =
    s.viewerIsSeriesOwner === true ||
    (s.seriesPublic === true && s.episodePublic === true);
  if (!readable) return false;
  return s.isR18 === false || s.viewerShowsR18 === true;
}

/** PRIVATE AI narration: only published rows, only for a viewer who can read the source. */
export function canServePrivateAiNarration(
  s: ReaderSourceSnapshot & Readonly<{ recordingPublic: boolean }>
): boolean {
  return s.recordingPublic === true && canViewReaderSource(s);
}

export type HumanAudioAccessSnapshot = ReaderSourceSnapshot &
  Readonly<{
    recordingPublic: boolean;
    viewerIsNarrator: boolean;
    /** series.recording_permission_mode === "open" right now */
    currentPermissionOpen: boolean;
    /** narrator's current global consent equals RECORDING_GLOBAL_CONSENT_VERSION */
    currentConsent: boolean;
  }>;

/**
 * Human narration. A PRIVATE row is playable only by its narrator, and only
 * while that narrator can still read the source in the Reader. The current
 * permission/consent checks come from Draft #160 and are an owner decision
 * (see the PR body): they also stop playback of past recordings after the
 * author closes recording or the narrator's consent version changes.
 */
export function canServeHumanRecordingAudio(s: HumanAudioAccessSnapshot): boolean {
  if (!canViewReaderSource(s)) return false;
  if (s.currentPermissionOpen !== true || s.currentConsent !== true) return false;
  if (s.recordingPublic === true) return true;
  return s.recordingPublic === false && s.viewerIsNarrator === true;
}
