/* Direct event linker: listens to chat/request events and calls QueueFloater.linkNextQueueTo
   immediately (no fetch/XHR interception needed). This is useful if your Spotify queue request
   is not initiated from this same page or the interception misses it.
   Include AFTER /queue-floater-boot.js and BEFORE /queue-linker.js.
*/
(function(){
  const TAG='[QF Event Linker]';

  function getProxyBase(){ return (window.QUEUE_FLOATER_IMAGE_PROXY || '').trim(); }

  async function fetchAvatarViaWorker(uniqueId){
    if (!uniqueId) return '';
    const base = getProxyBase();
    if (!base) return '';
    let origin = '';
    try { origin = new URL(base).origin; } catch { return ''; }
    try {
      const r = await fetch(origin + '/avatar?user=' + encodeURIComponent(uniqueId));
      if (!r.ok) return '';
      const j = await r.json();
      return j.avatar || '';
    } catch { return ''; }
  }

  function pick(obj, paths){
    for (const p of paths){
      const v = p.split('.').reduce((a,c)=> (a && a[c] != null) ? a[c] : undefined, obj);
      if (v) return v;
    }
    return '';
  }

  function extract(detail){
    const userName = pick(detail, [
      'userName','username','displayName','nickname','requester',
      'user.nickname','user.uniqueId','author.nickname','author.uniqueId'
    ]) || '';

    const uniqueId = pick(detail, [
      'uniqueId','user.uniqueId','author.uniqueId','username','requester'
    ]);

    const avatar = pick(detail, [
      'pfpUrl','avatarUrl','profileImageUrl','profilePicUrl','photoURL','imageUrl','picture',
      'user.avatarLarger','user.avatarMedium','user.avatarThumb',
      'author.avatarLarger','author.avatarMedium','author.avatarThumb',
      'user.profilePictureUrl','author.profilePictureUrl'
    ]);

    const userId = String(pick(detail, ['userId','id','user.userId','user.id','author.userId','author.id']) || '');
    return { userName, uniqueId, avatar, userId };
  }

  async function linkFromDetail(detail){
    if (!window.QueueFloater?.linkNextQueueTo) return;
    const { userName, uniqueId, avatar, userId } = extract(detail || {});
    // Skip placeholder-only events
    const isPlaceholder = (userName === 'Queued' || userName === 'Viewer' || !userName) && !uniqueId;
    if (isPlaceholder) return;

    let pfp = avatar;
    if (!pfp && uniqueId){
      pfp = await fetchAvatarViaWorker(uniqueId);
    }

    const name = userName || uniqueId || 'Viewer';
    window.QueueFloater.linkNextQueueTo({
      platform: 'tiktok',
      userId: userId,
      userName: name,
      pfpUrl: pfp || ''
    });

    try { console.log(TAG, 'linked immediately', { userName: name, hasPfp: !!pfp }); } catch {}
  }

  // Listen to likely events emitted by your system
  ['chat:songrequest','songrequest','songRequest','requests:add','request','chat:message'].forEach(evt=>{
    document.addEventListener(evt, e=>{
      try { linkFromDetail((e && e.detail) || {}); } catch {}
    }, true);
  });

  try { console.log(TAG, 'listening'); } catch {}
})();