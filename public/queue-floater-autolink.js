/* QueueFloater Autolink
   You call: window.QueueFloaterMarkNextRequester({ userId, userName, avatarUrl, uniqueId, platform })
   This script intercepts fetch/XHR to Spotify queue and calls linkNextQueueTo just-in-time.
*/
(function () {
  const TAG = '[QF Autolink]';
  const TTL_MS = 120000;

  function getProxyBase(){ return (window.QUEUE_FLOATER_IMAGE_PROXY || '').trim(); }
  function isHttpUrl(u){ try{ const x=new URL(u); return x.protocol==='https:'||x.protocol==='http:'; }catch{ return false; } }
  function dUS(s){ try{ return decodeURIComponent(s); }catch{ return s; } }
  function unwrapProxy(u){ try{ const x=new URL(u); const q=x.searchParams.get('url'); if(q){ let r=dUS(q); if(!/^https?:\/\//i.test(r)) r='https://'+r.replace(/^\/+/, ''); return r; } }catch{} return ''; }
  function normalizeAvatarUrl(u){
    if(!u) return u;
    const base=getProxyBase();
    if(base && u.startsWith(base)) return u;
    const unwrapped=unwrapProxy(u);
    if(unwrapped && isHttpUrl(unwrapped)) return base ? base+encodeURIComponent(unwrapped) : unwrapped;
    if(isHttpUrl(u)) return base ? base+encodeURIComponent(u) : u;
    return u;
  }

  function pickName(r){ return r.userName||r.username||r.displayName||r.nickname||r.user?.nickname||r.user?.uniqueId||r.name||'Viewer'; }
  function pickId(r){ return String(r.userId||r.id||r.uniqueId||r.user?.id||r.user?.userId||r.user?.uniqueId||''); }
  function pickAvatar(r){ return r.pfpUrl||r.avatarUrl||r.profileImageUrl||r.profilePicUrl||r.photoURL||r.imageUrl||r.picture||r.user?.avatarLarger||r.user?.avatarMedium||r.user?.avatarThumb||''; }
  function pickPlatform(r){ return r.platform||'tiktok'; }

  let pending=null;
  window.QueueFloaterMarkNextRequester=function(userLike){
    pending={ when:Date.now(), data:userLike||{} };
    try{ console.log(TAG,'marked requester',{ userName: pickName(pending.data) }); }catch{}
  };
  window.__QF_AL_READY = true;

  function consumeIfFresh(){
    if(!pending) return null;
    if(Date.now()-pending.when>TTL_MS){ pending=null; return null; }
    const d=pending.data||{}; pending=null; return d;
  }

  async function linkBeforeQueue(){
    const d=consumeIfFresh(); if(!d) return;
    const pfp=normalizeAvatarUrl(pickAvatar(d));
    if(!window.QueueFloater || typeof window.QueueFloater.linkNextQueueTo!=='function') return;
    window.QueueFloater.linkNextQueueTo({
      platform: pickPlatform(d),
      userId: pickId(d),
      userName: pickName(d),
      pfpUrl: pfp
    });
    try{ console.log(TAG,'linked',{ userName: pickName(d), hasPfp: !!pfp }); }catch{}
  }

  function isSpotifyQueueUrl(u){
    if(!u) return false;
    try{ const x=new URL(u, location.href); return x.hostname==='api.spotify.com' && x.pathname==='/v1/me/player/queue'; }catch{ return false; }
  }

  const origFetch=window.fetch;
  if(typeof origFetch==='function'){
    window.fetch=async function(input, init){
      try{
        const url=typeof input==='string' ? input : (input && input.url) || '';
        if(isSpotifyQueueUrl(url)){ await linkBeforeQueue(); }
      }catch{}
      return origFetch.apply(this, arguments);
    };
  }

  (function patchXHR(){
    if(!window.XMLHttpRequest) return;
    const Orig=window.XMLHttpRequest;
    function Wrapped(){
      const xhr=new Orig();
      let url=''; const open=xhr.open; xhr.open=function(m,u){ url=String(u||''); return open.apply(xhr, arguments); };
      const send=xhr.send; xhr.send=function(b){
        try{
          if(isSpotifyQueueUrl(url)){
            const p=linkBeforeQueue();
            if(p && typeof p.then==='function'){ p.finally(()=>send.apply(xhr,[b])); return; }
          }
        }catch{}
        return send.apply(xhr, arguments);
      };
      return xhr;
    }
    window.XMLHttpRequest=Wrapped;
  })();

  try{ console.log(TAG,'ready'); }catch{}
})();