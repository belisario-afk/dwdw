// Cloudflare Worker that serves:
// - /queue-floater.production.js  → the floater script (with Spotify bridge + TikTok PFP linkage)
// - /image-proxy?url=...          → image proxy with CORS for album art / avatars
//
// When using workers.dev (no zone routes), your URLs will be:
//   https://image-proxy.<your-subdomain>.workers.dev/queue-floater.production.js
//   https://image-proxy.<your-subdomain>.workers.dev/image-proxy?url=...
//
// Then in your page:
//   <script src="https://image-proxy.<your-subdomain>.workers.dev/queue-floater.production.js"></script>
//   <script>
//     QueueFloater.setConfig({
//       proxyImages: true,
//       proxy: (u) => 'https://image-proxy.<your-subdomain>.workers.dev/image-proxy?url=' + encodeURIComponent(u),
//       // defaultPfpUrl: '',
//       // color: '#22cc88',
//       // debug: true
//     });
//   </script>

export default {
  async fetch(req, env, ctx) {
    try {
      const url = new URL(req.url);

      // Serve the floater JS
      if (url.pathname === '/queue-floater.production.js') {
        return new Response(FLOATER_JS, {
          headers: {
            'content-type': 'application/javascript; charset=utf-8',
            'cache-control': 'public, max-age=31536000, immutable'
          }
        });
      }

      // Image proxy route
      if (url.pathname.startsWith('/image-proxy')) {
        const target = url.searchParams.get('url');
        if (!target) return new Response('missing url', { status: 400 });

        const upstream = await fetch(target, {
          headers: { 'User-Agent': 'streamqueue-proxy' }
        });

        const headers = new Headers(upstream.headers);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Cache-Control', 'public, max-age=3600, immutable');
        headers.delete('content-security-policy');
        headers.delete('content-security-policy-report-only');

        return new Response(upstream.body, { status: upstream.status, headers });
      }

      // Fallback: nothing else is handled here
      return new Response('Not found', { status: 404 });
    } catch (e) {
      return new Response('worker error', { status: 502 });
    }
  }
};

// The production floater script is embedded below.
// Default proxy uses a relative path; when included cross-origin, override it via QueueFloater.setConfig in your page.
const FLOATER_JS = `/*!
  Queue Floater (Production)
  - Album cover + circular profile picture + username + song title
  - Spotify queue bridge (fetch/XHR) → emits window 'songrequest' with oEmbed title/thumbnail
  - TikTok chat linkage: dispatch 'songrequest:chat' with {userId,userName,pfpUrl} before queueing to attach PFP
  - Minimal global API: window.QueueFloater
*/
;(function(){
  var CFG = {
    color: '#22cc88',
    ttlSec: 12,
    proxyImages: false,
    defaultPfpUrl: '',
    debug: false,
    proxy: function(u){ try { return '/image-proxy?url=' + encodeURIComponent(String(u||'')); } catch(e){ return u; } },
    bridgeUserName: 'Queued',
    chatLinkTTLms: 15000,
    recentChatWindowMs: 15000
  };

  var LOG_PREFIX = '[QueueFloater]';
  function log(){ if (CFG.debug) try { console.log.apply(console, [LOG_PREFIX].concat([].slice.call(arguments))); } catch(e){} }

  var canvas, ctx, rafId = 0;
  var items = [];
  var byId = Object.create(null);
  var nextChatUser = null;
  var recentChatUsers = [];

  function ensureCanvas(){
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'queue-floater-overlay';
    var s = canvas.style;
    s.position = 'fixed'; s.inset = '0'; s.width = '100vw'; s.height = '100vh';
    s.zIndex = '2147483647'; s.pointerEvents = 'none'; s.display = 'block';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    function resize(){
      var dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      canvas.width = Math.floor(innerWidth * dpr);
      canvas.height = Math.floor(innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', resize); resize();
    function loop(now){ drawFrame(now || performance.now()); rafId = requestAnimationFrame(loop); }
    rafId = requestAnimationFrame(loop);
  }
  function roundRectPath(x,y,w,h,r){
    var rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y); ctx.lineTo(x+w-rr,y); ctx.quadraticCurveTo(x+w,y,x+w,y+rr);
    ctx.lineTo(x+w,y+h-rr); ctx.quadraticCurveTo(x+w,y+h,x+w-rr,y+h);
    ctx.lineTo(x+rr,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-rr);
    ctx.lineTo(x,y+rr); ctx.quadraticCurveTo(x,y,x+rr,y); ctx.closePath();
  }
  function loadImg(url){
    if (!url) return Promise.resolve(null);
    return new Promise(function(resolve){
      var triedProxy = false;
      function tryLoad(u){
        try {
          var img = new Image();
          img.onload = function(){ resolve(img); };
          img.onerror = function(){ if (!triedProxy && CFG.proxyImages) { triedProxy = true; tryLoad(CFG.proxy(u)); } else { resolve(null); } };
          img.src = u;
        } catch (e) { resolve(null); }
      }
      tryLoad(url);
    });
  }
  function truncate(text, maxWidth, font){
    ctx.save(); ctx.font = font;
    if (ctx.measureText(text).width <= maxWidth) { ctx.restore(); return text; }
    var ell='…', lo=0, hi=text.length;
    while (lo < hi) { var mid=((lo+hi)>>1)+1; var t=text.slice(0,mid)+ell; if (ctx.measureText(t).width <= maxWidth) lo=mid; else hi=mid-1; }
    var out=text.slice(0,lo)+ell; ctx.restore(); return out;
  }
  function drawItem(it, now){
    var t=(now - it.t0)/1000, appear=Math.min(1,t/0.25), vanish=Math.min(1, Math.max(0,(it.life - t)/0.6)), a=appear*vanish;
    if (t > it.life) return false;
    var w=Math.max(360, Math.min(560, innerWidth*0.7)), h=150, x=it.x - w/2, y=it.y - h/2 + Math.sin(t*1.2)*6;
    ctx.save(); ctx.globalAlpha=a;
    ctx.shadowBlur=24; ctx.shadowColor=it.color; ctx.fillStyle='rgba(0,0,0,0.65)'; roundRectPath(x,y,w,h,18); ctx.fill(); ctx.shadowBlur=0;
    ctx.fillStyle=it.color; roundRectPath(x,y,6,h,18); ctx.fill();
    var pad=18, sq=h - pad*2, ax=x + pad + 8, ay=y + pad;
    if (it.album) { ctx.drawImage(it.album, ax, ay, sq, sq); } else { ctx.fillStyle='rgba(255,255,255,0.08)'; ctx.fillRect(ax,ay,sq,sq); ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.font='bold 42px system-ui, sans-serif'; ctx.fillText('♪', ax + sq*0.36, ay + sq*0.62); }
    var r=Math.floor(sq*0.25), pcx=ax + sq - r*0.7, pcy=ay + sq - r*0.7;
    ctx.save(); ctx.beginPath(); ctx.arc(pcx,pcy,r,0,Math.PI*2); ctx.closePath(); ctx.clip();
    if (it.pfp) { ctx.drawImage(it.pfp, pcx - r, pcy - r, r*2, r*2); } else { ctx.fillStyle='rgba(255,255,255,0.2)'; ctx.fillRect(pcx - r, pcy - r, r*2, r*2); ctx.fillStyle='#fff'; ctx.font='700 '+Math.max(12, Math.round(r*0.9))+'px system-ui, sans-serif'; var initials=(it.name||'G').trim().split(/\\s+/).map(function(s){return s[0];}).join('').slice(0,2).toUpperCase(); var tm=ctx.measureText(initials); ctx.fillText(initials, pcx - tm.width/2, pcy + (r*0.35)); }
    ctx.restore(); ctx.strokeStyle='rgba(0,0,0,0.6)'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(pcx,pcy,r,0,Math.PI*2); ctx.closePath(); ctx.stroke();
    var tx=ax + sq + 16, tw=w - (tx - x) - pad - 8;
    ctx.textBaseline='alphabetic'; ctx.textAlign='left'; ctx.lineWidth=4; ctx.strokeStyle='rgba(0,0,0,0.55)';
    ctx.fillStyle='#fff'; ctx.font='700 28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'; var nameY=y + 56; var name=truncate(it.name, tw, ctx.font); ctx.strokeText(name, tx, nameY); ctx.fillText(name, tx, nameY);
    ctx.fillStyle='rgba(255,255,255,0.92)'; ctx.font='500 22px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'; var songY=nameY + 40; var song=truncate(it.song, tw, ctx.font); ctx.strokeText(song, tx, songY); ctx.fillText(song, tx, songY);
    var underY=songY + 12, underW=Math.max(32, Math.min(tw, tw*(0.45 + 0.45*Math.abs(Math.sin(t*1.3))))); ctx.fillStyle=it.color; roundRectPath(tx, underY, underW, 5, 4); ctx.fill();
    ctx.restore(); return true;
  }
  function drawFrame(now){ if (!ctx) return; ctx.clearRect(0,0,innerWidth,innerHeight); for (var i=items.length-1;i>=0;i--){ if (!drawItem(items[i], now)) { delete byId[items[i].id]; items.splice(i,1); } } }
  function addFloater(detail){
    ensureCanvas();
    var id=String(detail.id || ((detail.userName||'Guest')+':'+(detail.songTitle||'')+':'+Date.now()+':'+Math.random()));
    if (byId[id]) return Promise.resolve();
    return Promise.all([ loadImg(detail.albumArtUrl), loadImg(detail.pfpUrl || CFG.defaultPfpUrl) ]).then(function(res){
      var album=res[0], pfp=res[1];
      var item={ id:id, name:String(detail.userName || 'Guest'), song:String(detail.songTitle || ''), color:String(detail.color || CFG.color), album:album, pfp:pfp, t0:performance.now(), life:Math.max(6, Math.min(60, Number(detail.ttlSec || CFG.ttlSec))), x:innerWidth*0.5, y:innerHeight*0.28 + Math.random()*20 - 10 };
      items.push(item); byId[id]=item; log('added', { id:item.id, name:item.name, song:item.song });
    });
  }
  function setConfig(patch){ patch=patch||{}; for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch,k)) CFG[k]=patch[k]; return CFG; }
  function linkNextQueueTo(chatUser){
    if (!chatUser) return;
    nextChatUser={ platform: chatUser.platform || 'tiktok', userId: String(chatUser.userId || ''), userName: String(chatUser.userName || ''), pfpUrl: String(chatUser.pfpUrl || ''), t: Date.now() };
    if (nextChatUser.userName || nextChatUser.userId || nextChatUser.pfpUrl) {
      recentChatUsers.unshift(nextChatUser);
      if (recentChatUsers.length > 50) recentChatUsers.length = 50;
      pruneRecentChat();
    }
  }
  function pruneRecentChat(){ var cutoff=Date.now() - Math.max(3000, CFG.recentChatWindowMs); for (var i=recentChatUsers.length-1;i>=0;i--){ if (recentChatUsers[i].t < cutoff) recentChatUsers.splice(i,1); } }
  function attachChatToDetail(detail){
    if (detail.pfpUrl) return detail;
    var now=Date.now();
    if (nextChatUser && (now - nextChatUser.t) <= CFG.chatLinkTTLms) {
      detail.userName = nextChatUser.userName || detail.userName || CFG.bridgeUserName;
      detail.pfpUrl = nextChatUser.pfpUrl || CFG.defaultPfpUrl || '';
      nextChatUser = null; return detail;
    }
    pruneRecentChat();
    if (recentChatUsers.length) {
      var cu=recentChatUsers[0];
      if (now - cu.t <= CFG.recentChatWindowMs) {
        detail.userName = cu.userName || detail.userName || CFG.bridgeUserName;
        detail.pfpUrl = cu.pfpUrl || CFG.defaultPfpUrl || '';
      }
    }
    return detail;
  }
  function onSongRequest(ev){ var d=(ev && ev.detail) || {}; addFloater(d); }
  function onSongRequestChat(ev){ var d=(ev && ev.detail) || {}; linkNextQueueTo(d); }
  function onTikTokComment(ev){
    try{ var d=(ev && ev.detail) || {}; var u=d.user || {};
      if (u && (u.uniqueId || u.userId || u.nickname || u.username || u.displayName || u.name)) {
        var name=String(u.nickname || u.displayName || u.username || u.uniqueId || u.name || '');
        var pfp=String(u.avatar || u.avatarUrl || (u.profilePicture && u.profilePicture.url) || '');
        if (name || pfp) {
          recentChatUsers.unshift({ platform:'tiktok', userId:String(u.userId || u.uniqueId || ''), userName:name, pfpUrl:pfp, t:Date.now() });
          if (recentChatUsers.length > 50) recentChatUsers.length = 50;
          pruneRecentChat();
        }
      }
    }catch(e){}
  }
  window.addEventListener('songrequest', onSongRequest, { passive:true });
  window.addEventListener('songrequest:chat', onSongRequestChat, { passive:true });
  window.addEventListener('tiktok:comment', onTikTokComment, { passive:true });
  if (!window.__queueBridgeInstalled) {
    window.__queueBridgeInstalled = true;
    function emit(detail){ try { window.dispatchEvent(new CustomEvent('songrequest', { detail: detail })); } catch(e){} }
    function trackIdFromUri(uri){ try { uri = decodeURIComponent(uri || ''); } catch(e){} var m=/spotify:track:([A-Za-z0-9]+)/.exec(uri || ''); return m ? m[1] : ''; }
    function emitFromTrackId(id){
      if (!id) return;
      var oembed='https://open.spotify.com/oembed?url=' + encodeURIComponent('https://open.spotify.com/track/' + id);
      fetch(oembed).then(function(r){ return r.ok ? r.json() : null; }).then(function(meta){
        var detail={ userName: CFG.bridgeUserName, songTitle: (meta && meta.title) || ('Track ' + id), albumArtUrl: meta && meta.thumbnail_url, color: CFG.color, ttlSec: CFG.ttlSec };
        detail = attachChatToDetail(detail); emit(detail);
      }).catch(function(){
        var detail={ userName: CFG.bridgeUserName, songTitle: 'Track ' + id, color: CFG.color, ttlSec: CFG.ttlSec };
        detail = attachChatToDetail(detail); emit(detail);
      });
    }
    function handle(url, body){
      try {
        var u=new URL(url, location.origin);
        if (!/\\/v1\\/(?:me|users\\/[^/]+)\\/player\\/queue$/.test(u.pathname)) return;
        var id=trackIdFromUri(u.searchParams.get('uri'));
        if (!id && body) {
          if (typeof body === 'string') {
            try { var sp=new URLSearchParams(body); id=trackIdFromUri(sp.get('uri')); } catch(e){}
            if (!id && body.trim().charAt(0) === '{') {
              try { var obj=JSON.parse(body); if (obj && obj.uri) id=trackIdFromUri(obj.uri); if (!id && obj && Array.isArray(obj.uris) && obj.uris.length) id=trackIdFromUri(obj.uris[0]); } catch(e){}
            }
          } else if (body && typeof body.get === 'function') { try { id=trackIdFromUri(body.get('uri')); } catch(e){} }
          else if (typeof body === 'object') { try { if (body.uri) id=trackIdFromUri(body.uri); if (!id && Array.isArray(body.uris) && body.uris.length) id=trackIdFromUri(body.uris[0]); } catch(e){} }
        }
        if (id) emitFromTrackId(id);
      } catch(e){}
    }
    if (window.fetch) {
      var _fetch=window.fetch.bind(window);
      window.fetch=function(input, init){ try { var url=(typeof input === 'string') ? input : (input && input.url) || ''; var body=init && init.body; if (url) handle(url, body); } catch(e){} return _fetch.apply(this, arguments); };
    }
    if (window.XMLHttpRequest) {
      var _open=XMLHttpRequest.prototype.open, _send=XMLHttpRequest.prototype.send, lastUrl='';
      XMLHttpRequest.prototype.open=function(method, url){ lastUrl=url; return _open.apply(this, arguments); };
      XMLHttpRequest.prototype.send=function(body){ try { if (lastUrl) handle(lastUrl, body); } catch(e){} return _send.apply(this, arguments); };
    }
  }
  window.QueueFloater = {
    show: function(d){ d=d||{}; return addFloater(d); },
    setConfig: setConfig,
    config: CFG,
    linkNextQueueTo: linkNextQueueTo,
    test: function(){ this.show({ userName:'TestUser', songTitle:'Debug Song', albumArtUrl:'https://i.scdn.co/image/ab67616d0000b273d2c3bf1a2f3b1c3c3e3b2b3a', pfpUrl: CFG.defaultPfpUrl }); }
  };
  ensureCanvas();
})();`;