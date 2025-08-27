// Lightweight bridge to send song requests into the "Requests Floaters" scene.
// Use this from your TikTok integration code. You can call emitSongRequest()
// whenever a viewer submits a song request.

export type SongRequestPayload = {
  id?: string;
  userName: string;
  songTitle: string;
  pfpUrl?: string;
  albumArtUrl?: string;
  color?: string;     // optional hex accent
  ttlSec?: number;    // default 14
};

// Primary API: call this to emit a request
export function emitSongRequest(req: SongRequestPayload) {
  window.dispatchEvent(new CustomEvent<SongRequestPayload>('songrequest', { detail: req }));
}

// Expose on window for quick manual testing or 3rd-party scripts
// Example in console:
//   window.__emitSongRequest({ userName: 'ChatUser', songTitle: 'Daft Punk — One More Time', pfpUrl: '...', albumArtUrl: '...' })
;(window as any).__emitSongRequest = emitSongRequest;

// Optional: Example WebSocket client if you normalize song requests server-side.
// The server should send JSON objects matching SongRequestPayload.
// Uncomment and set WS_URL to use.
/*
const WS_URL = 'wss://your-edge-or-server.example.com/songrequests';
try {
  const ws = new WebSocket(WS_URL);
  ws.onopen = () => console.log('[songrequests] connected');
  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data && data.userName && data.songTitle) {
        emitSongRequest(data);
      }
    } catch {}
  };
  ws.onclose = () => console.log('[songrequests] disconnected');
  ws.onerror = (e) => console.warn('[songrequests] error', e);
} catch (e) {
  console.warn('[songrequests] WS init failed:', e);
}
*/

// Optional: dev helper to emit mock requests periodically.
// Uncomment to preview the scene without TikTok.
/*
setInterval(() => {
  emitSongRequest({
    userName: ['Alex','Riley','Sam','Jordan'][Math.random()*4|0],
    songTitle: ['Justice — D.A.N.C.E','Porter — Language','Pegboard Nerds — Hero','ODESZA — A Moment Apart'][Math.random()*4|0],
    pfpUrl: 'https://i.pravatar.cc/128?img=' + ((Math.random()*70|0)+1),
    albumArtUrl: 'https://picsum.photos/seed/' + (Math.random()*10000|0) + '/256',
    color: ['#22cc88','#cc2288','#22aacc','#ffaa22'][Math.random()*4|0],
    ttlSec: 14
  });
}, 2800);
*/