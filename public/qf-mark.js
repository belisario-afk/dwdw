/* qf-mark.js — mark the next requester with a real avatar.
   Usage in your chat handler, RIGHT BEFORE you call Spotify queue:
     qfMarkFromChat(chatLikeObject)
*/
(function(){
  const TAG = '[QF Mark]';

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

  function pick(obj, keys){
    for (const k of keys){
      const v = k.split('.').reduce((a,c)=> (a && a[c] != null) ? a[c] : undefined, obj);
      if (v) return v;
    }
    return '';
  }

  // Best-effort extraction from various chat payload shapes
  function extract(chat){
    const userName = pick(chat, [
      'userName','username','displayName','nickname',
      'user.nickname','user.uniqueId','author.nickname','author.uniqueId'
    ]) || 'Viewer';

    const uniqueId = pick(chat, [
      'user.uniqueId','uniqueId','username','author.uniqueId'
    ]);

    const avatar = pick(chat, [
      'pfpUrl','avatarUrl','profileImageUrl','profilePicUrl','photoURL','imageUrl','picture',
      'user.avatarLarger','user.avatarMedium','user.avatarThumb',
      'author.avatarLarger','author.avatarMedium','author.avatarThumb',
      'user.profilePictureUrl','author.profilePictureUrl'
    ]);

    const userId = String(pick(chat, ['userId','id','user.userId','user.id','author.userId','author.id']) || '');
    return { userName, uniqueId, avatar, userId };
  }

  window.qfMarkFromChat = async function(chat){
    const { userName, uniqueId, avatar, userId } = extract(chat || {});
    let pfp = avatar;
    if (!pfp && uniqueId){
      // Try to fetch via worker as a fallback
      pfp = await fetchAvatarViaWorker(uniqueId);
    }

    if (typeof window.QueueFloaterMarkNextRequester !== 'function'){
      console.warn(TAG, 'autolink not loaded; include /queue-floater-autolink.js before qf-mark.js');
      return;
    }

    window.QueueFloaterMarkNextRequester({
      userId, userName, avatarUrl: pfp, uniqueId, platform: 'tiktok'
    });
    try { console.log(TAG, 'marked', { userName, hasPfp: !!pfp }); } catch {}
  };

  try { console.log(TAG, 'ready'); } catch {}
})();