/* QueueFloater boot: make avatar proxying Just Work whether the input
   pfpUrl is RAW (TikTok CDN) or already PROXIED (any ?url= style proxy).
   - Prefers your robust proxy (window.QUEUE_FLOATER_IMAGE_PROXY)
   - Avoids double-proxying
   - Unwraps known proxy patterns and re-wraps with robust proxy
   Load AFTER /queue-floater-config.js and /queue-floater.js, BEFORE /queue-linker.js.
*/
(function () {
  function getBase() {
    return (window.QUEUE_FLOATER_IMAGE_PROXY || '').trim();
  }

  function isHttpUrl(u) {
    try {
      const x = new URL(u);
      return x.protocol === 'https:' || x.protocol === 'http:';
    } catch {
      return false;
    }
  }

  function decodeURIComponentSafe(s) {
    try { return decodeURIComponent(s); } catch { return s; }
  }

  // Extract original URL from common proxy patterns (?url=...)
  function extractRawFromProxy(u) {
    try {
      const x = new URL(u);
      let raw = x.searchParams.get('url');
      if (raw) {
        raw = decodeURIComponentSafe(raw);
        if (!/^https?:\/\//i.test(raw)) {
          raw = 'https://' + raw.replace(/^\/+/, '');
        }
        return raw;
      }
      return '';
    } catch {
      return '';
    }
  }

  // Normalize to a single robustly proxied URL
  function normalizeAvatarUrl(u) {
    if (!u) return u;
    const base = getBase();

    // Already using our robust proxy
    if (base && u.startsWith(base)) return u;

    // Unwrap generic proxy (?url=...) then re-wrap
    const unwrapped = extractRawFromProxy(u);
    if (unwrapped && isHttpUrl(unwrapped)) {
      return base ? base + encodeURIComponent(unwrapped) : unwrapped;
    }

    // Raw URL -> wrap once
    if (isHttpUrl(u)) {
      return base ? base + encodeURIComponent(u) : u;
    }

    // Unknown format
    return u;
  }

  function applyConfig() {
    if (!window.QueueFloater || typeof window.QueueFloater.setConfig !== 'function') return;
    window.QueueFloater.setConfig({
      proxyImages: true,
      proxy: normalizeAvatarUrl
    });
    try {
      console.log('[QueueFloater Boot] proxy configured with robust normalization');
    } catch {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyConfig);
  } else {
    applyConfig();
  }
})();