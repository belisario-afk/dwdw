import { queueTrackAndEmit } from '../integrations/song-requests-bridge';

export async function queueTrackExample(params: {
  accessToken: string;
  viewerName: string;
  viewerAvatar?: string;
  color?: string;
  trackRef: string;     // spotify:track:... | open.spotify.com/track/... | id
  trackTitle?: string;
  trackAlbumArt?: string;
  preferredDeviceId?: string;
}) {
  const { accessToken, viewerName, viewerAvatar, color, trackRef, trackTitle, trackAlbumArt, preferredDeviceId } = params;

  await queueTrackAndEmit({
    accessToken,
    viewer: { displayName: viewerName, avatarUrl: viewerAvatar, color },
    trackUriOrUrlOrId: trackRef,
    trackMeta: { title: trackTitle, albumArtUrl: trackAlbumArt },
    deviceId: preferredDeviceId,          // optional
    autoActivateDevice: true,             // will fix 404 by activating a device and retrying
    minVolumePercentIfActivate: 10,       // optional safety
  });
}