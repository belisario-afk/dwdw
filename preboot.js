/* Preboot: complements the inline fallback.
   - Ensures window.TIKTOK_PROXY_URL is set and persisted.
   - Adds a backup intercept for Spotify audio-features (fetch + XHR) if inline failed.
   - Filters known harmless warnings/errors to keep the console clean.
   - Idempotent with inline intercepts (checks window.__AUDIO_FEATURES_INTERCEPTED).
*/
(function () {
  // Ensure TikTok proxy is set and persisted
  try {
    var meta = document.querySelector('meta[name="tiktok-proxy"]');
    var url = (meta && meta.getAttribute('content')) || 'https://dwdw-7a4i.onrender.com';
    url = url.replace(/\/+$/, '');
    window.TIKTOK_PROXY_URL = url;
    try { localStorage.setItem('TIKTOK_PROXY_URL', url); } catch {}
  } catch {}

  function isAF(u) { return typeof u === 'string' && u.indexOf('https://api.spotify.com/v1/audio-features') === 0; }

  // Backup fetch intercept if not already in place
  try {
    if (!window.__AUDIO_FEATURES_INTERCEPTED) {
      var origFetch = window.fetch && window.fetch.bind(window);
      if (origFetch) {
        window.fetch = function (input, init) {
          try {
            var u = (typeof input === 'string') ? input : (input && (input.url || input.toString())) || '';
            if (isAF(u)) {
              return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
            }
          } catch {}
          return origFetch(input, init);
        };
      }

      // Backup XHR intercept
      var OX = window.XMLHttpRequest;
      if (OX) {
        window.XMLHttpRequest = function XHRProxy() {
          var xhr = new OX();
          var silenced = false;
          var self = this;
          this.onreadystatechange = null; this.onload = null; this.onerror = null;
          this.readyState = 0; this.status = 0; this.responseText = ''; this.response = '';
          this.open = function (m, u, a, user, pass) {
            silenced = isAF(String(u||''));
            if (silenced) { self.readyState = 1; if (typeof self.onreadystatechange==='function') { try{ self.onreadystatechange(); }catch{} } return; }
            return xhr.open(m, u, a!==false, user, pass);
          };
          this.send = function (b) {
            if (!silenced) return xhr.send(b);
            setTimeout(function () {
              self.status=200; self.responseText='{}'; self.response='{}'; self.readyState=4;
              if (typeof self.onreadystatechange==='function') { try{ self.onreadystatechange(); }catch{} }
              if (typeof self.onload==='function') { try{ self.onload(); }catch{} }
            }, 0);
          };
          this.setRequestHeader = function(){ if(!silenced) return xhr.setRequestHeader.apply(xhr, arguments); };
          this.getAllResponseHeaders = function(){ return silenced ? '' : xhr.getAllResponseHeaders(); };
          this.getResponseHeader = function(n){ return silenced ? null : xhr.getResponseHeader(n); };
          this.abort = function(){ if(!silenced) return xhr.abort(); };
          xhr.onreadystatechange = function(){ if(!silenced){ try{ self.readyState=xhr.readyState; self.status=xhr.status; self.responseText=xhr.responseText; self.response=xhr.response; }catch{} if(typeof self.onreadystatechange==='function'){ try{ self.onreadystatechange(); }catch{} } } };
          xhr.onload = function(){ if(!silenced && typeof self.onload==='function'){ try{ self.onload(); }catch{} } };
          xhr.onerror = function(){ if(!silenced && typeof self.onerror==='function'){ try{ self.onerror(); }catch{} } };
          Object.defineProperty(self,'responseType',{ get(){ return silenced?'':xhr.responseType;}, set(v){ if(!silenced) xhr.responseType=v; }});
          Object.defineProperty(self,'withCredentials',{ get(){ return silenced?false:xhr.withCredentials;}, set(v){ if(!silenced) xhr.withCredentials=v; }});
          Object.defineProperty(self,'timeout',{ get(){ return silenced?0:xhr.timeout;}, set(v){ if(!silenced) xhr.timeout=v; }});
        };
      }

      window.__AUDIO_FEATURES_INTERCEPTED = true;
    }
  } catch {}

  // Filter a known harmless EME warning
  try {
    var _warn = console.warn && console.warn.bind(console);
    if (_warn) {
      console.warn = function () {
        var s = String(arguments[0] ?? '');
        if (s.includes('robustness level be specified')) return;
        return _warn.apply(console, arguments);
      };
    }
  } catch {}

  // Hide noisy console.error lines for audio-features (network blocked upstream)
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