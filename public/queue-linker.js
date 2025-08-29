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
    chatLinkTTLms: 60000,
    recentChatWindowMs: 60000,
    debug: true,
    defaultPfpUrl: ''
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

  // Convenience: queue with linking in one call (useful for testing from Console)
  // window.queueWithLink(chatObj, 'spotify:track:ID', 'Bearer TOKEN' or just TOKEN)
  window.queueWithLink = async function (chat, trackUri, token) {
    if (!trackUri) {
      console.warn('[QueueFloater] queueWithLink missing trackUri');
      return;
    }
    window.linkNextTikTokUser(chat);
    const authHeader = token
      ? (String(token).toLowerCase().startsWith('bearer ') ? String(token) : 'Bearer ' + String(token))
      : null;
    const opts = { method: 'POST' };
    if (authHeader) {
      opts.headers = { Authorization: authHeader };
    } else {
      // Allow a no-cors test so the floater still pops even without a token
      opts.mode = 'no-cors';
    }
    try {
      await fetch('https://api.spotify.com/v1/me/player/queue?uri=' + encodeURIComponent(trackUri), opts);
    } catch {}
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

  // Optional: remember the most recent TikTok chat, so you can call linkLastTikTokUser()
  let __lastTikTokChat = null;
  function remember(chat) { __lastTikTokChat = chat || __lastTikTokChat; }
  window.addEventListener('tiktok:comment', (e) => remember(e.detail));
  window.addEventListener('tiktok:request', (e) => remember(e.detail));
  window.addEventListener('tiktok:message', (e) => remember(e.detail));
  window.linkLastTikTokUser = function () {
    if (__lastTikTokChat) window.linkNextTikTokUser(__lastTikTokChat);
  };
})();