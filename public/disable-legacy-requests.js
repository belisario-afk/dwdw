/* Hard-disable legacy "Standalone Requests" and "Requests Floaters" overlays.
   - Stops their event listeners from firing
   - Removes/hides their DOM nodes
   - Stubs globals when present
   Load this as EARLY as possible on pages where QueueFloater runs.
*/
(function () {
  const TAG = '[Disable Legacy Requests]';

  // 1) Stop legacy request-related CustomEvents from reaching old overlays
  const BLOCKED_EVENTS = [
    'songrequest',
    'songRequest',
    'song-request',
    'sr:add',
    'requests:add',
    'requests:queued',
    'request'
  ];
  BLOCKED_EVENTS.forEach((evt) => {
    document.addEventListener(evt, (e) => {
      try { e.stopImmediatePropagation(); e.stopPropagation(); } catch {}
    }, true); // capture phase
  });

  // 2) Neutralize known globals if they appear
  const stub = (name) => {
    try {
      if (name in window) {
        Object.defineProperty(window, name, {
          configurable: true,
          enumerable: false,
          get() { return undefined; },
          set() { /* ignore */ }
        });
      }
    } catch {}
  };
  ['StandaloneRequests', 'RequestsFloaters', 'RequestsOverlay', 'SongRequests'].forEach(stub);

  // 3) Remove/hide legacy DOM overlays as they appear
  const HIDE_SELECTORS = [
    // Common guesses/names used by legacy widgets. Safe no-ops if not present.
    '#standalone-requests', '.standalone-requests', '[data-standalone-requests]',
    '#requests-floaters', '.requests-floaters', '[data-requests-floaters]',
    '.requests-overlay', '#requests-overlay', '[data-requests-overlay]',
    '.songrequests', '#songrequests'
  ];

  // Inject a tiny stylesheet to force-hide legacy nodes
  try {
    const css = document.createElement('style');
    css.setAttribute('data-legacy-requests-hide', 'true');
    css.textContent = HIDE_SELECTORS.join(',') + '{ display: none !important; visibility: hidden !important; }';
    document.documentElement.appendChild(css);
  } catch {}

  // Mutation observer to remove anything matching heuristics
  const isLegacyNode = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const txt = (el.className + ' ' + el.id).toLowerCase();
    if (!txt) return false;
    // Heuristics: contains "request" or "floater" but not "queuefloater"
    if ((/request|floater/.test(txt)) && !/queuefloater/.test(txt)) return true;
    // Attributes
    for (const a of el.attributes) {
      const v = (a.name + ' ' + a.value).toLowerCase();
      if ((/request|floater/.test(v)) && !/queuefloater/.test(v)) return true;
    }
    return false;
  };

  const nuke = (root) => {
    try {
      // Remove exact matches by selectors
      HIDE_SELECTORS.forEach((sel) => {
        root.querySelectorAll(sel).forEach((n) => n.remove());
      });
      // Heuristic removal
      const all = root.querySelectorAll('*');
      all.forEach((n) => {
        if (isLegacyNode(n)) {
          n.remove();
        }
      });
    } catch {}
  };

  const mo = new MutationObserver((muts) => {
    muts.forEach((m) => {
      m.addedNodes && m.addedNodes.forEach((n) => {
        if (n.nodeType === 1) {
          const el = n;
          if (isLegacyNode(el)) {
            try { el.remove(); } catch {}
          } else {
            nuke(el);
          }
        }
      });
    });
  });
  try {
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch {}

  // Initial sweep
  nuke(document);

  // Minimal console confirmation
  try { console.log(TAG, 'legacy overlays disabled'); } catch {}
})();