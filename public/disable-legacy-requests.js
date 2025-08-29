/* Force-disable or hide the legacy "Standalone Requests" / "Requests Floaters" overlay to avoid duplicate cards and confusion. */

(function () {
  // 1) Remove known DOM elements periodically
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

  // 2) If your director supports unregistering scenes, try that too
  try {
    const d = window.__director;
    if (d && typeof d.unregisterScene === 'function') {
      d.unregisterScene && d.unregisterScene('Requests Floaters');
      d.unregisterScene && d.unregisterScene('Standalone Requests');
    }
  } catch {}

  // 3) Last resort: inject CSS to hide it hard (also set in index.html style)
  try {
    const style = document.createElement('style');
    style.textContent = `
      .standalone-requests,
      [data-overlay="standalone-requests"],
      [data-overlay="requests-floaters"] { display: none !important; visibility: hidden !important; opacity: 0 !important; }
    `;
    document.head.appendChild(style);
  } catch {}
})();