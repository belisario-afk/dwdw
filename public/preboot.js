/* Preboot: runs before any other scripts.
   - Sets window.TIKTOK_PROXY_URL and persists to localStorage.
   - Silences Spotify audio-features 403/429 noise by intercepting fetch/XMLHttpRequest.
   - Filters the known EME robustness warning from app console calls (browser-origin warnings may still show in DevTools and are harmless).
*/
(function () {
  try {
    var u = 'https://dwdw-7a4i.onrender.com'.replace(/\/+$/, '');
    window.TIKTOK_PROXY_URL = u;
    try { localStorage.setItem('TIKTOK_PROXY_URL', u); } catch {}
  } catch {}

  // Filter some noisy console messages from app code
  try {
    var owarn = console.warn.bind(console);
    var oerror = console.error.bind(console);
    console.warn = function () {
      var s = String(arguments[0] ?? '');
      if (s.includes('robustness level be specified')) return;
      return owarn.apply(console, arguments);
    };
    console.error = function () {
      var s = String(arguments[0] ?? '');
      if (s.includes('Audio features fetch failed') || s.includes('/v1/audio-features')) return;
      return oerror.apply(console, arguments);
    };
  } catch {}

  // Decide if a request should be silenced
  function isAudioFeatures(url) {
    return typeof url === 'string' && url.indexOf('https://api.spotify.com/v1/audio-features') === 0;
  }

  // Patch fetch to return an empty object for audio-features to avoid 403 logs
  try {
    var origFetch = window.fetch && window.fetch.bind(window);
    if (origFetch) {
      window.fetch = function (input, init) {
        try {
          var url = (typeof input === 'string')
            ? input
            : (input && (input.url || input.toString())) || '';
          if (isAudioFeatures(url)) {
            return Promise.resolve(new Response('{}', {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }));
          }
        } catch {}
        return origFetch(input, init);
      };
    }
  } catch {}

  // Patch XMLHttpRequest as a safety net (if any code still uses XHR)
  try {
    var OrigXHR = window.XMLHttpRequest;
    if (OrigXHR) {
      function XHRProxy() {
        var xhr = new OrigXHR();
        var silenced = false;
        var self = this;

        this.onreadystatechange = null;
        this.onload = null;
        this.onerror = null;
        this.readyState = 0;
        this.status = 0;
        this.responseText = '';
        this.response = '';

        this.open = function (method, url, async, user, password) {
          var u = String(url || '');
          silenced = isAudioFeatures(u);
          if (silenced) {
            self.readyState = 1;
            if (typeof self.onreadystatechange === 'function') { try { self.onreadystatechange(); } catch {} }
          } else {
            return xhr.open(method, url, async !== false, user, password);
          }
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
})();