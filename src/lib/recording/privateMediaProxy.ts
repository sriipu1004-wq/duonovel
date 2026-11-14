import "server-only";
import { streamPrivateMediaObject } from "@/lib/recording/privateMediaStream";

/**
 * Stream a PRIVATE Storage object to an already-authorized viewer.
 *
 * Only invoke AFTER verifying the requesting viewer may access the recording.
 * The privileged key stays on the server: it is used for this read only and
 * no reusable signed URL is issued. Responses are private and never cached
 * across sessions.
 */
export async function streamAuthorizedPrivateRecording(
  request: Request,
  bucket: string,
  objectPath: string
): Promise<Response> {
  return streamPrivateMediaObject({
    request,
    bucket,
    objectPath,
    endpoint: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
