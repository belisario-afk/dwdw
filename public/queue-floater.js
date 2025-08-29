/*!
  Queue Floater (Production)
  - Album cover + circular profile picture + username + song title
  - Spotify queue bridge (fetch/XHR) → emits window 'songrequest' with oEmbed title/thumbnail
  - TikTok chat linkage: dispatch 'songrequest:chat' with {userId,userName,pfpUrl} before queueing to attach PFP
  - Minimal global API: window.QueueFloater

  Quick wiring from chat (before calling Spotify queue):
    window.dispatchEvent(new CustomEvent('songrequest:chat', {
      detail: { platform:'tiktok', userId:'123', userName:'Alice', pfpUrl:'https://...' }
    }));

  Optional: Directly show a floater:
    QueueFloater.show({ userName:'Alice', songTitle:'Song', albumArtUrl:'https://...', pfpUrl:'https://...' })
*/

;(function(){
  var CFG = {
    color: '#22cc88',          // accent color
    ttlSec: 12,                // seconds on screen
    proxyImages: false,        // set true if your image hosts block hotlinking
    defaultPfpUrl: '',         // fallback avatar if none provided
    debug: false,              // set true to see verbose logs
    // CORS proxy for images if needed (used only if proxyImages === true)
    proxy: function(u){ try { return 'https://images.weserv.nl/?url=' + encodeURIComponent(String(u||'').replace(/^https?:\/\//,'')); } catch(e){ return u; } },
    // Username for queue bridge when no chat user was linked
    bridgeUserName: 'Queued',
    // How long a chat user link remains valid for the next queue (ms)
    chatLinkTTLms: 15000,
    // Also fall back to the most recent chat user within this window (ms)
    recentChatWindowMs: 15000
  };

  var LOG_PREFIX = '[QueueFloater]';
  function log(){ if (CFG.debug) try { console.log.apply(console, [LOG_PREFIX].concat([].slice.call(arguments))); } catch(e){} }
  function warn(){ try { console.warn.apply(console, [LOG_PREFIX].concat([].slice.call(arguments))); } catch(e){} }

  // ---------- State ----------
  var canvas, ctx, rafId = 0;
  var items = [];
  var byId = Object.create(null);

  // Chat linkage state
  var nextChatUser = null; // {userId, userName, pfpUrl, t}
  var recentChatUsers = []; // array of same objects, newest first, pruned by time

  // ---------- Canvas Overlay ----------
  function ensureCanvas(){
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'queue-floater-overlay';
    var s = canvas.style;
    s.position = 'fixed';
    s.inset = '0';
    s.width = '100vw';
    s.height = '100vh';
    s.zIndex = '2147483647';
    s.pointerEvents = 'none';
    s.display = 'block';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');

    function resize(){
      var dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      canvas.width = Math.floor(innerWidth * dpr);
      canvas.height = Math.floor(innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', resize);
    resize();

    function loop(now){
      drawFrame(now || performance.now());
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
  }

  function roundRectPath(x, y, w, h, r){
    var rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function loadImg(url){
    if (!url) return Promise.resolve(null);
    return new Promise(function(resolve){
      var triedProxy = false;
      function tryLoad(u){
        try {
          var img = new Image();
          // No crossOrigin needed, we only draw.
          img.onload = function(){ resolve(img); };
          img.onerror = function(){
            if (!triedProxy && CFG.proxyImages) {
              triedProxy = true;
              tryLoad(CFG.proxy(u));
            } else {
              resolve(null);
            }
          };
          img.src = u;
        } catch (e) {
          resolve(null);
        }
      }
      tryLoad(url);
    });
  }

  function truncate(text, maxWidth, font){
    ctx.save();
    ctx.font = font;
    if (ctx.measureText(text).width <= maxWidth) {
      ctx.restore();
      return text;
    }
    var ell = '…';
    var lo = 0, hi = text.length;
    while (lo < hi) {
      var mid = ((lo + hi) >> 1) + 1;
      var t = text.slice(0, mid) + ell;
      if (ctx.measureText(t).width <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    var out = text.slice(0, lo) + ell;
    ctx.restore();
    return out;
  }

  function drawItem(it, now){
    var t = (now - it.t0) / 1000;
    var appear = Math.min(1, t / 0.25);
    var vanish = Math.min(1, Math.max(0, (it.life - t) / 0.6));
    var a = appear * vanish;
    if (t > it.life) return false;

    var w = Math.max(360, Math.min(560, innerWidth * 0.7));
    var h = 150;
    var x = it.x - w / 2;
    var y = it.y - h / 2 + Math.sin(t * 1.2) * 6;

    ctx.save();
    ctx.globalAlpha = a;

    // Glow + Panel
    ctx.shadowBlur = 24;
    ctx.shadowColor = it.color;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    roundRectPath(x, y, w, h, 18);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Accent bar
    ctx.fillStyle = it.color;
    roundRectPath(x, y, 6, h, 18);
    ctx.fill();

    // Album square
    var pad = 18;
    var sq = h - pad * 2;
    var ax = x + pad + 8;
    var ay = y + pad;
    if (it.album) {
      ctx.drawImage(it.album, ax, ay, sq, sq);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(ax, ay, sq, sq);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = 'bold 42px system-ui, sans-serif';
      ctx.fillText('♪', ax + sq * 0.36, ay + sq * 0.62);
    }

    // PFP circle overlapping album
    var r = Math.floor(sq * 0.25);
    var pcx = ax + sq - r * 0.7;
    var pcy = ay + sq - r * 0.7;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pcx, pcy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (it.pfp) {
      ctx.drawImage(it.pfp, pcx - r, pcy - r, r * 2, r * 2);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(pcx - r, pcy - r, r * 2, r * 2);
      ctx.fillStyle = '#fff';
      ctx.font = '700 ' + Math.max(12, Math.round(r * 0.9)) + 'px system-ui, sans-serif';
      var initials = (it.name || 'G').trim().split(/\s+/).map(function(s){ return s[0]; }).join('').slice(0,2).toUpperCase();
      var tm = ctx.measureText(initials);
      ctx.fillText(initials, pcx - tm.width/2, pcy + (r * 0.35));
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pcx, pcy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.stroke();

    // Text
    var tx = ax + sq + 16;
    var tw = w - (tx - x) - pad - 8;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';

    ctx.fillStyle = '#fff';
    ctx.font = '700 28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    var nameY = y + 56;
    var name = truncate(it.name, tw, ctx.font);
    ctx.strokeText(name, tx, nameY);
    ctx.fillText(name, tx, nameY);

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '500 22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    var songY = nameY + 40;
    var song = truncate(it.song, tw, ctx.font);
    ctx.strokeText(song, tx, songY);
    ctx.fillText(song, tx, songY);

    // Accent underline
    var underY = songY + 12;
    var underW = Math.max(32, Math.min(tw, tw * (0.45 + 0.45 * Math.abs(Math.sin(t * 1.3)))));
    ctx.fillStyle = it.color;
    roundRectPath(tx, underY, underW, 5, 4);
    ctx.fill();

    ctx.restore();
    return true;
  }

  function drawFrame(now){
    if (!ctx) return;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (var i = items.length - 1; i >= 0; i--){
      if (!drawItem(items[i], now)) {
        delete byId[items[i].id];
        items.splice(i, 1);
      }
    }
  }

  // ---------- Public API ----------
  function addFloater(detail){
    ensureCanvas();
    var id = String(detail.id || ((detail.userName||'Guest') + ':' + (detail.songTitle||'') + ':' + Date.now() + ':' + Math.random()));
    if (byId[id]) return Promise.resolve();

    return Promise.all([
      loadImg(detail.albumArtUrl),
      loadImg(detail.pfpUrl || CFG.defaultPfpUrl)
    ]).then(function(res){
      var album = res[0], pfp = res[1];
      var item = {
        id: id,
        name: String(detail.userName || 'Guest'),
        song: String(detail.songTitle || ''),
        color: String(detail.color || CFG.color),
        album: album,
        pfp: pfp,
        t0: performance.now(),
        life: Math.max(6, Math.min(60, Number(detail.ttlSec || CFG.ttlSec))),
        x: innerWidth * 0.5,
        y: innerHeight * 0.28 + Math.random() * 20 - 10
      };
      items.push(item);
      byId[id] = item;
      log('added', { id: item.id, name: item.name, song: item.song });
    });
  }

  function setConfig(patch){
    patch = patch || {};
    for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch,k)) CFG[k] = patch[k];
    return CFG;
  }

  function linkNextQueueTo(chatUser){
    // chatUser: {platform, userId, userName, pfpUrl}
    if (!chatUser) return;
    nextChatUser = {
      platform: chatUser.platform || 'tiktok',
      userId: String(chatUser.userId || ''),
      userName: String(chatUser.userName || ''),
      pfpUrl: String(chatUser.pfpUrl || ''),
      t: Date.now()
    };
    // also push to recents
    if (nextChatUser.userName || nextChatUser.userId || nextChatUser.pfpUrl) {
      recentChatUsers.unshift(nextChatUser);
      // cap + prune
      if (recentChatUsers.length > 50) recentChatUsers.length = 50;
      pruneRecentChat();
    }
    log('linked next queue to', nextChatUser);
  }

  function pruneRecentChat(){
    var cutoff = Date.now() - Math.max(3000, CFG.recentChatWindowMs);
    for (var i = recentChatUsers.length - 1; i >= 0; i--) {
      if (recentChatUsers[i].t < cutoff) recentChatUsers.splice(i, 1);
    }
  }

  // ---------- Event Wiring ----------
  function onSongRequest(ev){
    var d = (ev && ev.detail) || {};
    addFloater(d);
  }

  function attachChatToDetail(detail){
    // If detail already has pfpUrl, keep it.
    if (detail.pfpUrl) return detail;

    var now = Date.now();
    // Use nextChatUser if still fresh
    if (nextChatUser && (now - nextChatUser.t) <= CFG.chatLinkTTLms) {
      detail.userName = nextChatUser.userName || detail.userName || CFG.bridgeUserName;
      detail.pfpUrl = nextChatUser.pfpUrl || CFG.defaultPfpUrl || '';
      // one-shot: consume it
      nextChatUser = null;
      return detail;
    }

    pruneRecentChat();

    // Fallback: most recent chat user within window
    if (recentChatUsers.length) {
      var cu = recentChatUsers[0];
      if (now - cu.t <= CFG.recentChatWindowMs) {
        detail.userName = cu.userName || detail.userName || CFG.bridgeUserName;
        detail.pfpUrl = cu.pfpUrl || CFG.defaultPfpUrl || '';
      }
    }
    return detail;
  }

  function onSongRequestChat(ev){
    // Expected shape: { platform:'tiktok', userId:'...', userName:'...', pfpUrl:'...' }
    var d = (ev && ev.detail) || {};
    linkNextQueueTo(d);
  }

  // Optional: accept generic tiktok chat events if present in your app
  // If you dispatch a 'tiktok:comment' event with detail.user and detail.user.avatar,
  // we’ll treat it as a recent chat user (lower priority than explicit songrequest:chat).
  function onTikTokComment(ev){
    try {
      var d = (ev && ev.detail) || {};
      var u = d.user || {};
      if (u && (u.uniqueId || u.userId || u.nickname || u.username || u.displayName || u.name)) {
        var name = String(u.nickname || u.displayName || u.username || u.uniqueId || u.name || '');
        var pfp = String(u.avatar || u.avatarUrl || (u.profilePicture && u.profilePicture.url) || '');
        if (name || pfp) {
          recentChatUsers.unshift({ platform: 'tiktok', userId: String(u.userId || u.uniqueId || ''), userName: name, pfpUrl: pfp, t: Date.now() });
          if (recentChatUsers.length > 50) recentChatUsers.length = 50;
          pruneRecentChat();
        }
      }
    } catch(e){}
  }

  window.addEventListener('songrequest', onSongRequest, { passive: true });
  window.addEventListener('songrequest:chat', onSongRequestChat, { passive: true });
  window.addEventListener('tiktok:comment', onTikTokComment, { passive: true });

  // ---------- Spotify Queue Bridge ----------
  if (!window.__queueBridgeInstalled) {
    window.__queueBridgeInstalled = true;

    function emit(detail) {
      try { window.dispatchEvent(new CustomEvent('songrequest', { detail: detail })); } catch(e){}
    }

    function trackIdFromUri(uri){
      try { uri = decodeURIComponent(uri || ''); } catch(e){}
      var m = /spotify:track:([A-Za-z0-9]+)/.exec(uri || '');
      return m ? m[1] : '';
    }

    function emitFromTrackId(id){
      if (!id) return;
      var oembed = 'https://open.spotify.com/oembed?url=' + encodeURIComponent('https://open.spotify.com/track/' + id);
      fetch(oembed)
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(meta){
          var detail = {
            userName: CFG.bridgeUserName,
            songTitle: (meta && meta.title) || ('Track ' + id),
            albumArtUrl: meta && meta.thumbnail_url,
            color: CFG.color,
            ttlSec: CFG.ttlSec
          };
          detail = attachChatToDetail(detail);
          emit(detail);
          log('bridge emitted', id);
        })
        .catch(function(){
          var detail = {
            userName: CFG.bridgeUserName,
            songTitle: 'Track ' + id,
            color: CFG.color,
            ttlSec: CFG.ttlSec
          };
          detail = attachChatToDetail(detail);
          emit(detail);
          log('bridge emitted (no meta)', id);
        });
    }

    function handle(url, body){
      try {
        var u = new URL(url, location.origin);
        if (!/\/v1\/(?:me|users\/[^/]+)\/player\/queue$/.test(u.pathname)) return;

        var id = trackIdFromUri(u.searchParams.get('uri'));

        if (!id && body) {
          if (typeof body === 'string') {
            try { var sp = new URLSearchParams(body); id = trackIdFromUri(sp.get('uri')); } catch(e){}
            if (!id && body.trim().charAt(0) === '{') {
              try {
                var obj = JSON.parse(body);
                if (obj && obj.uri) id = trackIdFromUri(obj.uri);
                if (!id && obj && Array.isArray(obj.uris) && obj.uris.length) id = trackIdFromUri(obj.uris[0]);
              } catch(e){}
            }
          } else if (body && typeof body.get === 'function') {
            try { id = trackIdFromUri(body.get('uri')); } catch(e){}
          } else if (typeof body === 'object') {
            try {
              if (body.uri) id = trackIdFromUri(body.uri);
              if (!id && Array.isArray(body.uris) && body.uris.length) id = trackIdFromUri(body.uris[0]);
            } catch(e){}
          }
        }

        if (id) {
          log('bridge detected queue for track', id);
          emitFromTrackId(id);
        }
      } catch(e){}
    }

    // Patch fetch
    if (window.fetch) {
      var _fetch = window.fetch.bind(window);
      window.fetch = function(input, init){
        try {
          var url = (typeof input === 'string') ? input : (input && input.url) || '';
          var body = init && init.body;
          if (url) handle(url, body);
        } catch(e){}
        return _fetch.apply(this, arguments);
      };
    }
    // Patch XHR
    if (window.XMLHttpRequest) {
      var _open = XMLHttpRequest.prototype.open;
      var _send = XMLHttpRequest.prototype.send;
      var lastUrl = '';
      XMLHttpRequest.prototype.open = function(method, url){
        lastUrl = url;
        return _open.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function(body){
        try { if (lastUrl) handle(lastUrl, body); } catch(e){}
        return _send.apply(this, arguments);
      };
    }
  } else {
    log('bridge already installed');
  }

  // ---------- Export ----------
  window.QueueFloater = {
    show: function(d){ d = d || {}; return addFloater(d); },
    setConfig: setConfig,
    config: CFG,
    // Call this right before you queue a song (e.g., when a chat command is received)
    linkNextQueueTo: linkNextQueueTo,
    // Testing helper
    test: function(){
      this.show({
        userName: 'TestUser',
        songTitle: 'Debug Song',
        albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273d2c3bf1a2f3b1c3c3e3b2b3a',
        pfpUrl: CFG.defaultPfpUrl
      });
    }
  };

  // Auto-init canvas so it’s ready for first event
  ensureCanvas();
})();