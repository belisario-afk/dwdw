/* QueueFloater Autolink
   Wires your chat user to the next Spotify queue request automatically.
   - You call: window.QueueFloaterMarkNextRequester({ userId, userName, avatarUrl, uniqueId, platform })
   - This script intercepts fetch/XHR to https://api.spotify.com/v1/me/player/queue
     and calls QueueFloater.linkNextQueueTo(...) right before the request is sent.
   - It normalizes avatar URLs (raw or already proxied) to avoid double-proxying.
   Load order on chat page:
     <script src="/queue-floater-config.js"></script>
     <script src="/queue-floater.js"></script>
     <script src="/queue-floater-autolink.js"></script>
     <script src="/queue-linker.js"></script>
*/
(function () {
  const TAG = '[QF Autolink]';
  const TTL_MS = 120000; // consume requester info within 2 minutes

  // --- Proxy normalization (works with raw TikTok URLs or already-proxied URLs) ---
  function getProxyBase() {
    return (window.QUEUE_FLOATER_IMAGE_PROXY || '').trim();
  }
  function isHttpUrl(u) {
    try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; } catch { return false; }
  }
  function dUS(s) { try { return decodeURIComponent(s); } catch { return s; } }
  function unwrapProxy(u) {
    try {
      const x = new URL(u);
      const q = x.searchParams.get('url');
      if (q) {
        let raw = dUS(q);
        if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw.replace(/^\/+/, '');
        return raw;
      }
    } catch {}
    return '';
  }
  function normalizeAvatarUrl(u) {
    if (!u) return u;
    const base = getProxyBase();
    if (base && u.startsWith(base)) return u;       // already our robust proxy
    const unwrapped = unwrapProxy(u);
    if (unwrapped && isHttpUrl(unwrapped)) {
      return base ? base + encodeURIComponent(unwrapped) : unwrapped;
    }
    if (isHttpUrl(u)) {
      return base ? base + encodeURIComponent(u) : u;
    }
    return u;
  }

  // --- Heuristics to pick user fields ---
  function pickName(r) {
    return (
      r.userName || r.username || r.displayName || r.nickname ||
      r.user?.nickname || r.user?.uniqueId || r.name || 'Viewer'
    );
  }
  function pickId(r) {
    return String(
      r.userId || r.id || r.uniqueId || r.user?.id || r.user?.userId || r.user?.uniqueId || ''
    );
  }
  function pickAvatar(r) {
    return (
      r.pfpUrl || r.avatarUrl || r.profileImageUrl || r.profilePicUrl || r.photoURL ||
      r.imageUrl || r.picture ||
      r.user?.avatarLarger || r.user?.avatarMedium || r.user?.avatarThumb || ''
    );
  }
  function pickPlatform(r) {
    return r.platform || 'tiktok';
  }

  // Optional fallback: fetch TikTok avatar by username via worker /avatar
  async function fetchAvatarViaWorker(uniqueId) {
    if (!uniqueId) return '';
    const base = getProxyBase();
    if (!base) return '';
    let workerOrigin = '';
    try {
      const u = new URL(base);
      workerOrigin = u.origin;
    } catch { return ''; }
    try {
      const r = await fetch(workerOrigin + '/avatar?user=' + encodeURIComponent(uniqueId));
      if (!r.ok) return '';
      const j = await r.json();
      return j.avatar || '';
    } catch { return ''; }
  }

  // --- Pending requester buffer (you set this from your chat handler) ---
  let pending = null;
  window.QueueFloaterMarkNextRequester = function (userLike) {
    pending = {
      when: Date.now(),
      data: userLike || {}
    };
    try { console.log(TAG, 'marked requester', { userName: pickName(pending.data) }); } catch {}
  };

  function consumeIfFresh() {
    if (!pending) return null;
    if (Date.now() - pending.when > TTL_MS) { pending = null; return null; }
    const d = pending.data || {};
    pending = null; // consume once
    return d;
  }

  async function linkBeforeQueue() {
    const d = consumeIfFresh();
    if (!d) return;
    let avatar = pickAvatar(d);
    if (!avatar && (d.uniqueId || d.user?.uniqueId)) {
      avatar = await fetchAvatarViaWorker(d.uniqueId || d.user?.uniqueId);
    }
    const pfp = normalizeAvatarUrl(avatar || '');
    if (!window.QueueFloater || typeof window.QueueFloater.linkNextQueueTo !== 'function') return;
    window.QueueFloater.linkNextQueueTo({
      platform: pickPlatform(d),
      userId: pickId(d),
      userName: pickName(d),
      pfpUrl: pfp
    });
    try { console.log(TAG, 'linked', { userName: pickName(d), hasPfp: !!pfp }); } catch {}
  }

  // --- Detect Spotify queue requests (fetch + XHR) ---
  function isSpotifyQueueUrl(u) {
    if (!u) return false;
    try {
      const x = new URL(u, location.href);
      return x.hostname === 'api.spotify.com' && x.pathname === '/v1/me/player/queue';
    } catch { return false; }
  }

  // Patch fetch
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = async function(input, init) {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (isSpotifyQueueUrl(url)) {
          await linkBeforeQueue();
        }
      } catch {}
      return origFetch.apply(this, arguments);
    };
  }

  // Patch XHR
  (function patchXHR() {
    if (!window.XMLHttpRequest) return;
    const OrigXHR = window.XMLHttpRequest;
    function WrappedXHR() {
      const xhr = new OrigXHR();
      let queuedUrl = '';
      const origOpen = xhr.open;
      xhr.open = function(method, url) {
        try { queuedUrl = String(url || ''); } catch { queuedUrl = ''; }
        return origOpen.apply(xhr, arguments);
      };
      const origSend = xhr.send;
      xhr.send = function(body) {
        try {
          if (isSpotifyQueueUrl(queuedUrl)) {
            // Ensure we link before the request is actually sent
            const p = linkBeforeQueue();
            if (p && typeof p.then === 'function') {
              // fire send after link resolves, without blocking too long
              p.finally(() => origSend.apply(xhr, [body]));
              return;
            }
          }
        } catch {}
        return origSend.apply(xhr, [body]);
      };
      return xhr;
    }
    window.XMLHttpRequest = WrappedXHR;
  })();

  try { console.log(TAG, 'ready'); } catch {}
})();