/* Queue Floater linker: reliably associates TikTok requester -> next Spotify queue call.
   - Uses a robust image proxy (set window.QUEUE_FLOATER_IMAGE_PROXY in index.html).
   - Auto-links on both fetch() and XHR queue calls (no timing issues).
   - Remembers the most recent TikTok chat via multiple event channels.
*/

(function () {
  if (!window.QueueFloater) {
    console.error('[QueueFloater] not loaded from /queue-floater.js. Ensure public/queue-floater.js exists.');
    return;
  }

  // Proxy helper: prefer your Cloudflare Worker, fallback to images.weserv.nl
  function proxyViaWorker(u) {
    if (!u) return '';
    if (window.QUEUE_FLOATER_IMAGE_PROXY) {
      return String(window.QUEUE_FLOATER_IMAGE_PROXY) + encodeURIComponent(u);
    }
    try {
      const url = new URL(u);
      const hostAndPath = url.host + url.pathname + (url.search || '');
      return 'https://images.weserv.nl/?url=' + encodeURIComponent(hostAndPath);
    } catch {
      return u;
    }
  }

  // Configure QueueFloater
  QueueFloater.setConfig({
    proxyImages: true,
    proxy: proxyViaWorker,
    color: '#22cc88',
    chatLinkTTLms: 60000,        // allow longer link window during testing
    recentChatWindowMs: 60000,   // associate with chats in the last minute
    debug: true,
    defaultPfpUrl: ''            // e.g., proxyViaWorker('https://i.pravatar.cc/64?img=5')
  });

  // Track the most recent TikTok chat object we saw
  let __lastTikTokChat = null;
  let __lastLinkTs = 0;

  function rememberChat(chat) {
    if (!chat) return;
    __lastTikTokChat = chat;
  }

  // Robust mapping from TikTok chat to required fields
  function mapTikTokUser(chat) {
    const user = chat && (chat.user || chat);

    const userId =
      user?.userId || chat?.userId || chat?.uniqueId || user?.uniqueId || '';

    const userName =
      user?.nickname || user?.displayName || user?.username || user?.uniqueId ||
      chat?.nickname || chat?.displayName || chat?.username || chat?.uniqueId ||
      'TikTok User';

    // Try many common TikTok avatar fields; proxy to ensure it loads
    const raw =
      user?.profilePictureUrl || user?.avatarLarger || user?.avatarMedium || user?.avatarThumb ||
      chat?.profilePictureUrl || chat?.avatarUrl || chat?.avatarLarger || chat?.avatarMedium || chat?.avatarThumb || '';

    const pfpUrl = raw ? proxyViaWorker(raw) : '';
    return { platform: 'tiktok', userId, userName, pfpUrl, _rawAvatar: raw || '' };
  }

  // Public helper: call this with your chat object BEFORE queueing
  window.linkNextTikTokUser = function (chat) {
    try {
      rememberChat(chat);
      const payload = mapTikTokUser(chat);
      QueueFloater.linkNextQueueTo(payload);
      __lastLinkTs = Date.now();
      console.debug('[QueueFloater] linked next queue to', payload);
    } catch (e) {
      console.warn('[QueueFloater] linkNextQueueTo failed', e);
    }
  };

  // Listen to a wide set of possible events and remember chatters
  const CHAT_EVT_NAMES = [
    'tiktok:comment', 'tiktok:request', 'tiktok:message',
    'chat:command', 'sr:command', 'songrequest:chat', 'chat:message'
  ];
  CHAT_EVT_NAMES.forEach((evt) => {
    window.addEventListener(evt, (e) => {
      try { rememberChat(e.detail || e.data || null); } catch {}
    });
  });

  // Also watch postMessage traffic for objects that look like TikTok chats
  window.addEventListener('message', (e) => {
    try {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      const looksTikTok =
        d.platform === 'tiktok' ||
        d?.user?.uniqueId || d?.uniqueId ||
        d?.user?.avatarThumb || d?.avatarThumb;
      if (looksTikTok) rememberChat(d);
    } catch {}
  });

  // Ensure we link a TikTok user right before ANY queue call, even if the bridge forgot.
  function ensureLinkBeforeQueue() {
    const now = Date.now();
    const age = now - __lastLinkTs;
    if (age > 3000 && __lastTikTokChat) {
      window.linkNextTikTokUser(__lastTikTokChat);
      console.debug('[QueueFloater] auto-linked most recent TikTok user just before queue call');
    }
  }

  // Patch fetch
  (function patchFetch() {
    if (!window.fetch || window.__queueFloaterFetchPatched) return;
    const origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url && url.includes('/v1/me/player/queue')) {
          ensureLinkBeforeQueue();
        }
      } catch {}
      return origFetch(input, init);
    };
    window.__queueFloaterFetchPatched = true;
  })();

  // Patch XHR
  (function patchXHR() {
    if (window.__queueFloaterXHRPatched) return;
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    let lastURL = '';
    XMLHttpRequest.prototype.open = function (method, url) {
      try { lastURL = String(url || ''); } catch { lastURL = ''; }
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      try {
        if (lastURL && lastURL.includes('/v1/me/player/queue')) {
          ensureLinkBeforeQueue();
        }
      } catch {}
      return origSend.apply(this, arguments);
    };
    window.__queueFloaterXHRPatched = true;
  })();

  // Optional: quick console test using your posted TikTok avatar URL
  window.__testQueueFloater = async function () {
    const avatar = 'https://p19-pu-sign-useast8.tiktokcdn-us.com/tos-useast5-avt-0068-tx/7fd17cea1f34121764a7b307ee952dc4~tplv-tiktokx-cropcenter:1080:1080.jpeg?dr=9640&refresh_token=9a7b12b8&x-expires=1756612800&x-signature=3YOiJSho8xmtWHDP2F1XBNSuMjk%3D&t=4d5b0474&ps=13740610&shp=a5d48078&shcp=81f88b70&idc=useast5';
    const proxied = proxyViaWorker(avatar);
    QueueFloater.linkNextQueueTo({
      platform: 'tiktok',
      userId: '123',
      userName: 'Standalone Test',
      pfpUrl: proxied
    });
    try {
      await fetch('https://api.spotify.com/v1/me/player/queue?uri=' + encodeURIComponent('spotify:track:4NRXx6U3G3J3RkGfHh1Euh'), {
        method: 'POST',
        mode: 'no-cors'
      });
    } catch {}
  };
})();