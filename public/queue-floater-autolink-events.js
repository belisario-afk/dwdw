/* Optional: If you can't change your chat handler, this listens for legacy events
   and marks the requester automatically before the queue request.
   Include AFTER /queue-floater-autolink.js.
*/
(function(){
  const TAG='[QF Event Autolink]';
  function mark(d){
    if(!window.QueueFloaterMarkNextRequester) return;
    window.QueueFloaterMarkNextRequester(d);
  }
  async function maybeFetchAvatar(name){
    try{
      const base=(window.QUEUE_FLOATER_IMAGE_PROXY||'').trim();
      if(!base||!name) return '';
      const origin=new URL(base).origin;
      const r=await fetch(origin+'/avatar?user='+encodeURIComponent(name));
      if(!r.ok) return '';
      const j=await r.json(); return j.avatar||'';
    }catch{ return ''; }
  }
  async function handle(detail){
    const userName = detail.userName || detail.username || detail.requester || '';
    const uniqueId = detail.uniqueId || userName;
    let avatar = detail.avatarUrl || detail.profileImageUrl || '';
    if(!avatar && uniqueId) avatar = await maybeFetchAvatar(uniqueId);
    if (!userName && !uniqueId) return;
    mark({ userName, uniqueId, avatarUrl: avatar, platform: 'tiktok' });
    try { console.log(TAG, 'marked from event', { userName: userName || uniqueId, hasPfp: !!avatar }); } catch {}
  }
  ['songrequest','songRequest','requests:add','request','chat:songrequest'].forEach(evt=>{
    document.addEventListener(evt, e=>{ try{ handle((e && e.detail) || {}); }catch{}; }, true);
  });
  try{ console.log(TAG,'listening'); }catch{}
})();