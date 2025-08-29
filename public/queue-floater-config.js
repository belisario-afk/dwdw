// Set your robust image proxy base (Cloudflare Worker). Change if yours differs.
window.QUEUE_FLOATER_IMAGE_PROXY = 'https://image-proxy-robust.tikusers862.workers.dev/image-proxy?url=';

// Apply core QueueFloater config once it's available
(function () {
  const cfg = {
    debug: true,
    proxyImages: true,
    chatLinkTTLms: 120000,
    recentChatWindowMs: 120000
  };
  function apply() {
    if (window.QueueFloater && typeof window.QueueFloater.setConfig === 'function') {
      window.QueueFloater.setConfig(cfg);
      try { console.log('[QueueFloater Config] applied', cfg); } catch {}
    } else {
      setTimeout(apply, 250);
    }
  }
  apply();
})();