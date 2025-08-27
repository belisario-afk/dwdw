// Example usage to replace your direct POST call.
// Call this from your chat command handler when you get a track to queue.
import { queueTrackAndEmit } from '../integrations/song-requests-bridge';

export async function queueTrackExample(params: {
  accessToken: string;
  viewerName: string;
  viewerAvatar?: string;
  color?: string;
  trackRef: string; // spotify:track:... | open.spotify.com/track/... | id
  trackTitle?: string;
  trackAlbumArt?: string;
  deviceId?: string;
}) {
  const { accessToken, viewerName, viewerAvatar, color, trackRef, trackTitle, trackAlbumArt, deviceId } = params;
  await queueTrackAndEmit({
    accessToken,
    viewer: { displayName: viewerName, avatarUrl: viewerAvatar, color },
    trackUriOrUrlOrId: trackRef,
    trackMeta: { title: trackTitle, albumArtUrl: trackAlbumArt },
    deviceId,
  });
}