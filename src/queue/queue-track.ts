import { queueTrackAndEmit } from '../integrations/song-requests-bridge';

// Somewhere after parsing the chat command:
await queueTrackAndEmit({
  accessToken: yourAccessToken,                 // from your auth flow
  viewer: { displayName: chatUserName, avatarUrl: chatUserAvatar, color: '#22cc88' },
  trackUriOrUrlOrId: 'spotify:track:5yuShbu70mtHXY0yLzCQLQ',
  trackMeta: { title: 'Artist — Track', albumArtUrl: 'https://i.scdn.co/...' },
  // deviceId: optionalDeviceId
});