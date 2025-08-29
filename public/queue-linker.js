/* Queue Floater linker: associates TikTok requester -> next Spotify queue call */
/* Requires public/queue-floater.js to be present and loaded before this file. */

(function () {
  if (!window.QueueFloater) {
    console.error('[QueueFloater] not loaded from /queue-floater.js. Ensure public/queue-floater.js exists.');
    return;
  }

  // Proxy helper for avatars/album art to avoid CORS/hotlink issues
  function proxy(u) {
    return 'https://image-proxy.tikusers862.workers.dev/image-proxy?url=' + encodeURIComponent(u || '');
  }

  // Configure QueueFloater
  QueueFloater.setConfig({
    proxyImages: true,
    proxy,
    color: '#22cc88',
    chatLinkTTLms: 60000,        // allow longer link window during testing
    recentChatWindowMs: 60000,   // same window for last-chat association
    debug: true,                 // enable to see logs in Console
    defaultPfpUrl: ''            // optional: proxy('https://i.pravatar.cc/100?img=5')
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

    const pfpUrl = raw ? proxy(raw) : '';
    return { platform: 'tiktok', userId, userName, pfpUrl };
  }

  // Expose a helper you can call RIGHT BEFORE your POST to /v1/me/player/queue
  window.linkNextTikTokUser = function (chat) {
    try {
      const payload = mapTikTokUser(chat);
      QueueFloater.linkNextQueueTo(payload);
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

  // Optional: quick console test helper
  window.__testQueueFloater = async function () {
    const avatar = 'https://i.pravatar.cc/100?img=3';
    const proxied = proxy(avatar);
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