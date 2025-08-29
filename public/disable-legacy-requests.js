/* Aggressively disable or hide the legacy "Standalone Requests" / "Requests Floaters" overlay. */

(function () {
  // 1) Intercept console logs to detect when that overlay initializes
  (function interceptConsole() {
    if (window.__legacyRequestsConsolePatched) return;
    const origLog = console.log.bind(console);
    const origInfo = console.info ? console.info.bind(console) : origLog;
    function checkArgs(args) {
      try {
        const s = args.map(a => (typeof a === 'string' ? a : '')).join(' ');
        if (/\[Standalone Requests\]/i.test(s) || /\[Requests Floaters\]/i.test(s)) {
          setTimeout(removeLegacyNodes, 0);
        }
      } catch {}
    }
    console.log = function () { checkArgs([].slice.call(arguments)); return origLog.apply(console, arguments); };
    console.info = function () { checkArgs([].slice.call(arguments)); return origInfo.apply(console, arguments); };
    window.__legacyRequestsConsolePatched = true;
  })();

  // 2) Periodically remove known DOM elements
  function removeLegacyNodes() {
    const sel = [
      '.standalone-requests',
      '[data-overlay="standalone-requests"]',
      '[data-overlay="requests-floaters"]',
      '#standalone-requests',
      '#requests-floaters'
    ].join(',');
    document.querySelectorAll(sel).forEach((el) => {
      try { el.remove(); } catch {}
    });
  }
  const interval = setInterval(removeLegacyNodes, 1000);
  window.addEventListener('beforeunload', () => clearInterval(interval));

  // 3) Try to unregister scenes if supported
  try {
    const d = window.__director;
    if (d && typeof d.unregisterScene === 'function') {
      try { d.unregisterScene('Requests Floaters'); } catch {}
      try { d.unregisterScene('Standalone Requests'); } catch {}
    }
  } catch {}

  // 4) Inject CSS to hard-hide anything that slips through
  try {
    const style = document.createElement('style');
    style.textContent = `
      .standalone-requests,
      [data-overlay="standalone-requests"],
      [data-overlay="requests-floaters"],
      #standalone-requests,
      #requests-floaters {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
  } catch {}
})();