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
    /**
     * The narrator currently has a consent row whose version is in
     * ACCEPTED_RECORDING_PLAYBACK_CONSENT_VERSIONS (no row = withdrawn).
     */
    currentConsent: boolean;
  }>;

/**
 * Human narration. A PRIVATE row is playable only by its narrator, and only
 * while that narrator can still read the source in the Reader.
 *
 * Owner decisions (2026-11-14):
 * - consent withdrawn (no accepted consent row) stops playback;
 * - the author closing recording (recording_permission_mode != "open") does
 *   NOT stop playback of past narration; it only blocks NEW recordings
 *   (H1/H2 checks are unchanged).
 * The Reader projection applies the same consent rule (consentedNarratorIds).
 */
export function canServeHumanRecordingAudio(s: HumanAudioAccessSnapshot): boolean {
  if (!canViewReaderSource(s)) return false;
  if (s.currentConsent !== true) return false;
  if (s.recordingPublic === true) return true;
  return s.recordingPublic === false && s.viewerIsNarrator === true;
}
