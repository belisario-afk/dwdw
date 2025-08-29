/* Queue Floater linker: associates TikTok requester -> next Spotify queue call */
/* Requires public/queue-floater.js to be present and loaded before this file. */

(function () {
  if (!window.QueueFloater) {
    console.error('[QueueFloater] not loaded from /queue-floater.js. Ensure public/queue-floater.js exists.');
    return;
  }

  // Optional: set this to your own Cloudflare Worker proxy endpoint for images
  // e.g., 'https://your-subdomain.your-account.workers.dev/image-proxy?url='
  // You can deploy the worker provided in workers/image-proxy.js
  window.QUEUE_FLOATER_IMAGE_PROXY =
    window.QUEUE_FLOATER_IMAGE_PROXY ||
    '';

  function proxyViaWorker(u) {
    if (!u) return '';
    if (window.QUEUE_FLOATER_IMAGE_PROXY) {
      return window.QUEUE_FLOATER_IMAGE_PROXY + encodeURIComponent(u);
    }
    // Fallback proxy via images.weserv.nl (requires host+path only, no protocol)
    try {
      const url = new URL(u);
      const hostAndPath = url.host + url.pathname + (url.search || '');
      return 'https://images.weserv.nl/?url=' + encodeURIComponent(hostAndPath);
    } catch {
      return u;
    }
  }

  // Configure QueueFloater with robust defaults
  QueueFloater.setConfig({
    proxyImages: true,
    proxy: proxyViaWorker,
    color: '#22cc88',
    chatLinkTTLms: 60000,        // allow longer link window during testing
    recentChatWindowMs: 60000,   // same window for last-chat association
    debug: true,                 // enable to see logs in Console
    defaultPfpUrl: ''            // optional: proxyViaWorker('https://i.pravatar.cc/100?img=5')
  });

  // Map likely TikTok fields → { userId, userName, pfpUrl }
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
    return { platform: 'tiktok', userId, userName, pfpUrl, pfpSource: raw ? new URL(raw, location.href).host : '' };
  }

  // Expose a helper you can call RIGHT BEFORE your POST to /v1/me/player/queue
  let __lastLinkTs = 0;
  window.linkNextTikTokUser = function (chat) {
    try {
      const payload = mapTikTokUser(chat);
      if (!payload.pfpUrl) {
        console.warn('[QueueFloater] No avatar URL found on chat object; will fall back to album art.');
      }
      QueueFloater.linkNextQueueTo(payload);
      __lastLinkTs = Date.now();
      console.debug('[QueueFloater] linked next queue to', payload);
    } catch (e) {
      console.warn('[QueueFloater] linkNextQueueTo failed', e);
    }
  };

  // Best-effort: wire any events your app might emit to auto-link
  const evtNames = [
    'tiktok:comment',
    'tiktok:request',
    'tiktok:message',
    'chat:command',
    'sr:command',
    'songrequest:chat'
  ];
  evtNames.forEach((evt) => {
    window.addEventListener(evt, (e) => window.linkNextTikTokUser(e.detail));
  });

  // Track the most recent TikTok chat so we can auto-link on queue detection
  let __lastTikTokChat = null;
  function remember(chat) { __lastTikTokChat = chat || __lastTikTokChat; }
  window.addEventListener('tiktok:comment', (e) => remember(e.detail));
  window.addEventListener('tiktok:request', (e) => remember(e.detail));
  window.addEventListener('tiktok:message', (e) => remember(e.detail));

  // Better way: auto-link right before ANY Spotify queue call by monkey-patching fetch.
  // This removes timing errors if your command handler forgets to call linkNextTikTokUser.
  (function patchFetchForQueueLinking() {
    if (!window.fetch || window.__queueFloaterFetchPatched) return;
    const origFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url && url.includes('/v1/me/player/queue')) {
          const now = Date.now();
          const age = now - __lastLinkTs;
          if (age > 3000 && __lastTikTokChat) {
            // If we didn't link in the last 3s, link the most recent TikTok chat now
            window.linkNextTikTokUser(__lastTikTokChat);
            console.debug('[QueueFloater] auto-linked most recent TikTok user just before queue call');
          }
        }
      } catch {}
      return origFetch(input, init);
    };
    window.__queueFloaterFetchPatched = true;
  })();

  // Optional: quick console test helper
  window.__testQueueFloater = async function () {
    const avatar = 'https://i.pravatar.cc/100?img=3';
    const proxied = proxyViaWorker(avatar);
    QueueFloater.linkNextQueueTo({
      platform: 'tiktok',
      userId: '123',
      userName: 'Explicit Map',
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