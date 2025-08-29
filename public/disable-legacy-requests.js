/* Force-disable or hide the legacy "Standalone Requests" / "Requests Floaters" overlay to avoid duplicate cards and confusion. */

(function () {
  // Remove known DOM elements periodically
  const rm = () => {
    const sel = [
      '.standalone-requests',
      '[data-overlay="standalone-requests"]',
      '[data-overlay="requests-floaters"]'
    ].join(',');
    document.querySelectorAll(sel).forEach((el) => {
      if (el && el.parentElement) el.parentElement.removeChild(el);
    });
  };
  const interval = setInterval(rm, 1000);
  window.addEventListener('beforeunload', () => clearInterval(interval));

  // Try to unregister those scenes if the director allows it
  try {
    const d = window.__director;
    if (d && typeof d.unregisterScene === 'function') {
      try { d.unregisterScene('Requests Floaters'); } catch {}
      try { d.unregisterScene('Standalone Requests'); } catch {}
    }
  } catch {}

  // Also inject CSS to hard-hide it in case removal misses
  try {
    const style = document.createElement('style');
    style.textContent = `
      .standalone-requests,
      [data-overlay="standalone-requests"],
      [data-overlay="requests-floaters"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
  } catch {}
})();