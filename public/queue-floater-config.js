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

  // Try to extract the original image URL from common proxy patterns.
  // Supports:
  // - Any proxy that uses ?url=<encoded_or_plain_http(s)_url>
  // - images.weserv.nl/?url=host/path (no scheme): we add https://
  function extractRawFromProxy(u) {
    try {
      const x = new URL(u);

      // Generic ?url= case
      let raw = x.searchParams.get('url');
      if (raw) {
        raw = decodeURIComponentSafe(raw);
        // weserv may pass host/path without scheme
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

  // Normalize whatever pfpUrl we get into a single, robustly proxied URL.
  // Strategy:
  // - If already using our robust proxy base, return as-is.
  // - Else if looks like a proxy (has ?url=), unwrap to RAW and re-wrap with robust base.
  // - Else if RAW http(s) URL, wrap with robust base.
  // - Else return unmodified.
  function normalizeAvatarUrl(u) {
    if (!u) return u;
    const base = getBase();

    // Already proxied by our robust worker
    if (base && u.startsWith(base)) return u;

    // Proxied by some other service? (e.g., weserv, legacy proxy, etc.)
    const unwrapped = extractRawFromProxy(u);
    if (unwrapped && isHttpUrl(unwrapped)) {
      return base ? base + encodeURIComponent(unwrapped) : unwrapped;
    }

    // RAW http(s) image URL: wrap once
    if (isHttpUrl(u)) {
      return base ? base + encodeURIComponent(u) : u;
    }

    // Unknown format; return as-is
    return u;
  }

  // Apply configuration if QueueFloater is present
  function applyConfig() {
    if (!window.QueueFloater || typeof window.QueueFloater.setConfig !== 'function') return;
    window.QueueFloater.setConfig({
      // Keep image proxying ON; our normalize function ensures single-layer proxying.
      proxyImages: true,
      proxy: normalizeAvatarUrl
    });
    try {
      console.log('[QueueFloater Boot] proxy configured with robust normalization');
    } catch {}
  }

  // If QueueFloater is already loaded, apply immediately; otherwise wait.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyConfig);
  } else {
    applyConfig();
  }
})();