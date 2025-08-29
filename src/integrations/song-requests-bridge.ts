// Add this helper and call it right before you queue a track to Spotify.
// Example usage is shown at the bottom.

type TikTokUser = {
  uniqueId?: string;
  userId?: string | number;
  nickname?: string;
  username?: string;
  displayName?: string;
  name?: string;
  avatar?: string;
  avatarUrl?: string;
  profilePicture?: { url?: string };
};

function normalizeTikTokAvatar(url?: string): string {
  try {
    if (!url) return '';
    // TikTok CDN URLs are fine; your QueueFloater config proxies if needed.
    // Strip whitespace and guard against accidental double-proxying.
    const u = String(url).trim();
    return u;
  } catch {
    return '';
  }
}

export function markNextRequesterFromTikTok(user: TikTokUser | null | undefined): void {
  const userId =
    (user?.uniqueId as string) ??
    (user?.userId != null ? String(user.userId) : '');

  const userName =
    user?.nickname ??
    user?.displayName ??
    user?.username ??
    (user?.uniqueId as string) ??
    user?.name ??
    '';

  const pfpUrl =
    normalizeTikTokAvatar(
      user?.avatar ??
      user?.avatarUrl ??
      user?.profilePicture?.url
    ) || '';

  const detail = {
    platform: 'tiktok',
    userId,
    userName,
    pfpUrl
  };

  // 1) Let QueueFloater pick it up via its event listener
  try {
    window.dispatchEvent(new CustomEvent('songrequest:chat', { detail }));
  } catch {}

  // 2) Belt-and-suspenders: direct link for immediate effect
  try {
    // Available because /public/queue-floater.js is loaded on the page
    (window as any).QueueFloater?.linkNextQueueTo?.(detail);
  } catch {}
}

// OPTIONAL: expose for quick console testing
// @ts-ignore
(window as any).markNextRequesterFromTikTok = markNextRequesterFromTikTok;

/**
 * Example usage:
 * When you parse a TikTok chat command (e.g., "!sr <song>"),
 * call markNextRequesterFromTikTok(msg.user) BEFORE you queue the track.
 */
// async function onSongRequestCommand(msg: { user: TikTokUser; song: string }) {
//   markNextRequesterFromTikTok(msg.user);
//   await queueTrackToSpotify(msg.song); // your existing queue logic
// }