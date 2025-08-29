/* Auto-link the next requester to the next Spotify queue call (fetch/XHR).
   Usage in your chat handler RIGHT BEFORE queueing the song:
     window.QueueFloaterMarkNextRequester({ userId, userName, avatarUrl, uniqueId, platform: 'tiktok' });
   Then execute your fetch/XHR to POST https://api.spotify.com/v1/me/player/queue...
   Load after queue-floater.js (and after queue-floater-boot.js if you use it), before queue-linker.js.
*/
(function(){
  if (window.__QF_AUTOLINK_INSTALLED__) return;
  window.__QF_AUTOLINK_INSTALLED__ = true;

  const TAG='[QF Autolink]';
  let pending=null;
  const TTL=120000;

  window.QueueFloaterMarkNextRequester=(u)=>{
    pending={ when:Date.now(), data:u||{} };
    try{ console.log(TAG, 'marked', pending.data.userName||pending.data.username); }catch{}
  };

  function consume(){
    if(!pending) return null;
    if(Date.now()-pending.when>TTL){ pending=null; return null; }
    const d=pending.data; pending=null; return d;
  }

  async function linkBeforeQueue(){
    const d=consume(); if(!d) return;
    const name=d.userName||d.username||d.displayName||d.nickname||d.user?.nickname||d.user?.uniqueId||'Viewer';
    const id=''+(d.userId||d.id||d.uniqueId||d.user?.userId||d.user?.id||'');
    // Avatar can be raw or already proxied. queue-floater-boot will normalize if loaded.
    const pfp=d.pfpUrl||d.avatarUrl||d.profileImageUrl||d.profilePicUrl||d.photoURL
             ||d.imageUrl||d.picture||d.user?.avatarLarger||d.user?.avatarMedium||d.user?.avatarThumb||'';
    if(window.QueueFloater?.linkNextQueueTo){
      window.QueueFloater.linkNextQueueTo({ platform:d.platform||'tiktok', userId:id, userName:name, pfpUrl:pfp });
      try{ console.log(TAG,'linked',{ userName:name, hasPfp: !!pfp }); }catch{}
    }
  }

  function isSpotifyQueueUrl(u){
    try{
      const x=new URL(typeof u==='string'?u:(u?.url||''), location.href);
      return x.hostname==='api.spotify.com' && x.pathname==='/v1/me/player/queue';
    }catch{ return false; }
  }

  // Patch fetch
  const of=window.fetch;
  if(typeof of==='function'){
    window.fetch=async function(input, init){
      try{ if(isSpotifyQueueUrl(input)) await linkBeforeQueue(); }catch{}
      return of.apply(this, arguments);
    };
  }

  // Patch XHR as well (in case your code uses it)
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