// Shared by server-side Work and client-safe playback code.
import { isUuid } from "@/lib/uuid";
const PREFIX="r18-private:";
export function recordingAudioPlaybackHref(recordingId:unknown, path:unknown):string {
  if(typeof path!=="string") return "";
  const stored=path.trim();
  if(!stored.startsWith(PREFIX)) return stored;
  if(typeof recordingId!=="string" || !isUuid(recordingId) || stored.length===PREFIX.length) return "";
  return "/api/recordings/ai-audio/"+recordingId;
}
