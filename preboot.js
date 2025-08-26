/* Preboot: runs before any other scripts
   - Ensures window.TIKTOK_PROXY_URL is set immediately (and persisted).
   - Silences Spotify audio-features 403 noise by intercepting before the network.
   - Adds an XHR safety net and filters known harmless warnings/errors.
   - Idempotent with the inline fallback (checks window.__AUDIO_FEATURES_INTERCEPTED).
*/
(function () {
  // 1) Ensure TikTok proxy is set and persisted
  try {
    var meta = document.querySelector('meta[name="tiktok-proxy"]');
    var url = (meta && meta.getAttribute('content')) || 'https://dwdw-7a4i.onrender.com';
    url = url.replace(/\/+$/, ''); // strip trailing slashes
    window.TIKTOK_PROXY_URL = url;
    try { localStorage.setItem('TIKTOK_PROXY_URL', url); } catch {}
  } catch {}

  // 2) Silence Spotify audio-features fetches (return empty JSON so no network error logs)
  function isAudioFeatures(u) {
    return typeof u === 'string' && u.indexOf('https://api.spotify.com/v1/audio-features') === 0;
  }

  // Patch fetch (only if not already patched by inline fallback)
  try {
    if (!window.__AUDIO_FEATURES_INTERCEPTED) {
      var origFetch = window.fetch && window.fetch.bind(window);
      if (origFetch) {
        window.fetch = function (input, init) {
          try {
            var u = (typeof input === 'string')
              ? input
              : (input && ((input.url) || input.toString())) || '';
            if (isAudioFeatures(u)) {
              return Promise.resolve(new Response('{}', {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              }));
            }
          } catch {}
          return origFetch(input, init);
        };
        window.__AUDIO_FEATURES_INTERCEPTED = true;
      }
    }
  } catch {}

  // Patch XMLHttpRequest as a safety net (in case some code uses XHR)
  try {
    var OrigXHR = window.XMLHttpRequest;
    if (OrigXHR) {
      function XHRProxy() {
        var xhr = new OrigXHR();
        var silenced = false;
        var self = this;

        // Public props/events
        this.onreadystatechange = null;
        this.onload = null;
        this.onerror = null;
        this.readyState = 0;
        this.status = 0;
        this.responseText = '';
        this.response = '';

        this.open = function (method, u, async, user, password) {
          var s = String(u || '');
          silenced = isAudioFeatures(s);
          if (silenced) {
            self.readyState = 1;
            if (typeof self.onreadystatechange === 'function') { try { self.onreadystatechange(); } catch {} }
            return;
          }
          return xhr.open(method, u, async !== false, user, password);
        };

        this.send = function (body) {
          if (!silenced) return xhr.send(body);
          setTimeout(function () {
            self.status = 200;
            self.responseText = '{}';
            self.response = '{}';
            self.readyState = 4;
            if (typeof self.onreadystatechange === 'function') { try { self.onreadystatechange(); } catch {} }
            if (typeof self.onload === 'function') { try { self.onload(); } catch {} }
          }, 0);
        };

        this.setRequestHeader = function () {
          if (!silenced) return xhr.setRequestHeader.apply(xhr, arguments);
        };
        this.getAllResponseHeaders = function () {
          return silenced ? '' : xhr.getAllResponseHeaders();
        };
        this.getResponseHeader = function (name) {
          return silenced ? null : xhr.getResponseHeader(name);
        };
        this.abort = function () {
          if (!silenced) return xhr.abort();
        };

        // Mirror updates for non-silenced requests
        xhr.onreadystatechange = function () {
          if (!silenced) {
            try {
              self.readyState = xhr.readyState;
              self.status = xhr.status;
              self.responseText = xhr.responseText;
              self.response = xhr.response;
            } catch {}
            if (typeof self.onreadystatechange === 'function') { try { self.onreadystatechange(); } catch {} }
          }
        };
        xhr.onload = function () {
          if (!silenced && typeof self.onload === 'function') { try { self.onload(); } catch {} }
        };
        xhr.onerror = function () {
          if (!silenced && typeof self.onerror === 'function') { try { self.onerror(); } catch {} }
        };

        // Property proxies
        Object.defineProperty(self, 'responseType', {
          get: function () { return silenced ? '' : xhr.responseType; },
          set: function (v) { if (!silenced) xhr.responseType = v; }
        });
        Object.defineProperty(self, 'withCredentials', {
          get: function () { return silenced ? false : xhr.withCredentials; },
          set: function (v) { if (!silenced) xhr.withCredentials = v; }
        });
        Object.defineProperty(self, 'timeout', {
          get: function () { return silenced ? 0 : xhr.timeout; },
          set: function (v) { if (!silenced) xhr.timeout = v; }
        });
      }
      XHRProxy.DONE = OrigXHR.DONE;
      XHRProxy.HEADERS_RECEIVED = OrigXHR.HEADERS_RECEIVED;
      XHRProxy.LOADING = OrigXHR.LOADING;
      XHRProxy.OPENED = OrigXHR.OPENED;
      XHRProxy.UNSENT = OrigXHR.UNSENT;
      window.XMLHttpRequest = XHRProxy;
    }
  } catch {}

  // 3) Filter known harmless warnings/errors from app-origin logs
  try {
    var _warn = console.warn && console.warn.bind(console);
    if (_warn) {
      console.warn = function () {
        var s = String(arguments[0] ?? '');
        if (s.includes('robustness level be specified')) return; // EME robustness hint
        return _warn.apply(console, arguments);
      };
    }
  } catch {}

  try {
    var _error = console.error && console.error.bind(console);
    if (_error) {
      console.error = function () {
        var s = String(arguments[0] ?? '');
        if (s.includes('/v1/audio-features') || s.includes('Audio features fetch failed')) return;
        return _error.apply(console, arguments);
      };
    }
  } catch {}
})();