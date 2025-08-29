/* QueueFloater image proxy configuration.
   Set ONE of the URLs below to point to your proxy endpoint.
   - EXISTING_PROXY: your current proxy (use if it already handles TikTok with a Referer)
   - ROBUST_PROXY: the Cloudflare Worker robust proxy
   Only ONE should be non-empty. Example values included in comments.
*/

(function () {
  // Example: your existing proxy that forwards ?url= and returns the image with CORS enabled
  // const EXISTING_PROXY = 'https://your-existing-proxy.example.com/image-proxy?url=';
  const EXISTING_PROXY = '';

  // Your deployed Cloudflare Worker robust proxy
  const ROBUST_PROXY = 'https://image-proxy-robust.tikusers862.workers.dev/image-proxy?url=';

  // Pick ONE: if both are set, ROBUST_PROXY takes precedence.
  const chosen = (ROBUST_PROXY || EXISTING_PROXY || '').trim();

  if (typeof window !== 'undefined') {
    window.QUEUE_FLOATER_IMAGE_PROXY = chosen;

    // Optional: quick health check helper (run from DevTools)
    // window.__testProxy('https://i.pravatar.cc/64')
    window.__testProxy = async function (rawUrl) {
      if (!window.QUEUE_FLOATER_IMAGE_PROXY) {
        console.warn('[QueueFloater] No proxy configured. Edit public/queue-floater-config.js');
        return;
      }
      const testUrl = rawUrl || 'https://i.pravatar.cc/64';
      const proxied = window.QUEUE_FLOATER_IMAGE_PROXY + encodeURIComponent(testUrl);
      try {
        const r = await fetch(proxied, { method: 'GET' });
        console.log('[QueueFloater] Proxy test', { status: r.status, type: r.headers.get('content-type') });
      } catch (e) {
        console.error('[QueueFloater] Proxy test failed', e);
      }
    };
  }
})();