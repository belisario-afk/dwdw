/* Preboot (load this before your app bundle)
   - Ensures window.TIKTOK_PROXY_URL is defined ASAP (from <meta name="tiktok-proxy"> or fallback).
   - Silences Spotify audio-features requests by short-circuiting both fetch() and XMLHttpRequest.
   - Filters a known harmless EME warning and the noisy "audio-features" console errors.
   - Idempotent: safe to include multiple times.
*/
(function () {
  // 1) Provide TikTok proxy URL early and persist it
  try {
    var meta = document.querySelector('meta[name="tiktok-proxy"]');
    var url = (meta && meta.getAttribute('content')) || 'https://dwdw-7a4i.onrender.com';
    url = url.replace(/\/+$/, ''); // strip trailing slash(es)
    window.TIKTOK_PROXY_URL = url;
    try { localStorage.setItem('TIKTOK_PROXY_URL', url); } catch {}
  } catch {}

  // Helper: identify Spotify audio-features endpoint
  function isAudioFeatures(u) {
    return typeof u === 'string' && u.indexOf('https://api.spotify.com/v1/audio-features') === 0;
  }
  function urlFromInput(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input === 'object') {
      if (typeof input.url === 'string') return input.url;
      try { return String(input); } catch {}
    }
    return '';
  }

  // 2) Intercept fetch for audio-features
  try {
    var ofetch = window.fetch && window.fetch.bind(window);
    if (ofetch && !ofetch.__af_patched) {
      var wrappedFetch = function (input, init) {
        try {
          var u = urlFromInput(input);
          if (isAudioFeatures(u)) {
            return Promise.resolve(new Response('{}', {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }));
          }
        } catch {}
        return ofetch(input, init);
      };
      // Mark as patched to avoid double-wrapping
      wrappedFetch.__af_patched = true;
      window.fetch = wrappedFetch;
    }
  } catch {}

  // 3) Intercept XMLHttpRequest for audio-features
  try {
    var OrigXHR = window.XMLHttpRequest;
    if (OrigXHR && !window.__XHR_AF_PATCHED__) {
      function XHRProxy() {
        var xhr = new OrigXHR();
        var silenced = false;
        var self = this;

        // Public handler props
        this.onreadystatechange = null;
        this.onload = null;
        this.onerror = null;

        // Mirror some readable props
        this.readyState = 0;
        this.status = 0;
        this.responseText = '';
        this.response = '';

        this.open = function (method, u, async, user, password) {
          var s = String(u || '');
          silenced = isAudioFeatures(s);
          if (silenced) {
            // Move to OPENED state for any code listening
            self.readyState = 1;
            if (typeof self.onreadystatechange === 'function') { try { self.onreadystatechange(); } catch {} }
            return; // Do not call through
          }
          return xhr.open(method, u, async !== false, user, password);
        };

        this.send = function (body) {
          if (!silenced) return xhr.send(body);
          // Synthesize a successful, empty JSON response
          setTimeout(function () {
            self.status = 200;
            self.responseText = '{}';
            self.response = '{}';
            self.readyState = 4;
            if (typeof self.onreadystatechange === 'function') { try { self.onreadystatechange(); } catch {} }
            if (typeof self.onload === 'function') { try { self.onload(); } catch {} }
          }, 0);
        };

        this.abort = function () { if (!silenced) return xhr.abort(); };
        this.setRequestHeader = function () { if (!silenced) return xhr.setRequestHeader.apply(xhr, arguments); };
        this.getAllResponseHeaders = function () { return silenced ? '' : xhr.getAllResponseHeaders(); };
        this.getResponseHeader = function (name) { return silenced ? null : xhr.getResponseHeader(name); };

        // Proxy native events to our instance when not silenced
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
        xhr.onload = function () { if (!silenced && typeof self.onload === 'function') { try { self.onload(); } catch {} } };
        xhr.onerror = function () { if (!silenced && typeof self.onerror === 'function') { try { self.onerror(); } catch {} } };

        // Common property proxies
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

      // Mirror static readyState constants
      XHRProxy.UNSENT = OrigXHR.UNSENT;
      XHRProxy.OPENED = OrigXHR.OPENED;
      XHRProxy.HEADERS_RECEIVED = OrigXHR.HEADERS_RECEIVED;
      XHRProxy.LOADING = OrigXHR.LOADING;
      XHRProxy.DONE = OrigXHR.DONE;

      window.XMLHttpRequest = XHRProxy;
      window.__XHR_AF_PATCHED__ = true;
    }
  } catch {}

  // 4) Clean up console noise
  try {
    var _warn = console.warn && console.warn.bind(console);
    if (_warn && !_warn.__preboot_patched__) {
      var wrappedWarn = function () {
        var s = String(arguments[0] ?? '');
        if (s.includes('robustness level be specified')) return;
        return _warn.apply(console, arguments);
      };
      wrappedWarn.__preboot_patched__ = true;
      console.warn = wrappedWarn;
    }
  } catch {}

  try {
    var _error = console.error && console.error.bind(console);
    if (_error && !_error.__preboot_patched__) {
      var wrappedError = function () {
        var s = String(arguments[0] ?? '');
        if (s.includes('/v1/audio-features') || s.includes('Audio features fetch failed')) return;
        return _error.apply(console, arguments);
      };
      wrappedError.__preboot_patched__ = true;
      console.error = wrappedError;
    }
  } catch {}

  // Marker for diagnostics
  try { window.__PREBOOT_READY__ = true; } catch {}
})();