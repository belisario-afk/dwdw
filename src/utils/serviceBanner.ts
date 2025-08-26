// Tiny UI helper: shows a dismissible banner for audio-features issues.
// This version has no imports, so it won't fail the build if other modules
// don't export a handler hook.

type ShowArg =
  | string
  | Error
  | { message?: string; status?: number; endpoint?: string }
  | unknown;

export function initServiceBannerForAudioFeatures() {
  let banner: HTMLDivElement | null = null;

  function ensureBanner() {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.style.position = 'fixed';
    banner.style.left = '50%';
    banner.style.top = '16px';
    banner.style.transform = 'translateX(-50%)';
    banner.style.maxWidth = 'min(92vw, 720px)';
    banner.style.padding = '10px 12px';
    banner.style.borderRadius = '10px';
    banner.style.background = 'rgba(200, 50, 80, 0.9)';
    banner.style.color = '#fff';
    banner.style.border = '1px solid rgba(255,255,255,0.15)';
    banner.style.boxShadow = '0 8px 24px rgba(0,0,0,0.35)';
    banner.style.font = '14px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    banner.style.zIndex = '9999';
    banner.style.pointerEvents = 'auto';
    banner.style.display = 'none';

    const text = document.createElement('span');
    text.style.marginRight = '10px';
    text.style.whiteSpace = 'pre-wrap';
    text.style.wordBreak = 'break-word';
    text.id = 'audio-features-banner-text';
    banner.appendChild(text);

    const btn = document.createElement('button');
    btn.textContent = 'Dismiss';
    btn.style.cursor = 'pointer';
    btn.style.padding = '6px 10px';
    btn.style.border = '1px solid rgba(255,255,255,0.25)';
    btn.style.background = 'rgba(0,0,0,0.25)';
    btn.style.color = '#fff';
    btn.style.borderRadius = '8px';
    btn.onclick = hide;
    banner.appendChild(btn);

    document.body.appendChild(banner);
    return banner;
  }

  function msgFrom(arg: ShowArg): string {
    try {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return arg.message || 'Audio features unavailable.';
      if (arg && typeof arg === 'object') {
        const anyArg = arg as any;
        const bits = [
          anyArg.message || 'Audio features unavailable.',
          anyArg.status ? `(status ${anyArg.status})` : '',
          anyArg.endpoint ? `at ${anyArg.endpoint}` : '',
        ].filter(Boolean);
        return bits.join(' ');
      }
    } catch {
      /* ignore */
    }
    return 'Audio features unavailable.';
  }

  function show(arg?: ShowArg) {
    const el = ensureBanner();
    const text = el.querySelector<HTMLSpanElement>('#audio-features-banner-text');
    if (text) text.textContent = msgFrom(arg ?? 'Audio features unavailable.');
    el.style.display = 'inline-flex';
    el.style.alignItems = 'center';
    el.style.gap = '8px';
  }

  function hide() {
    if (banner) banner.style.display = 'none';
  }

  // Optional global hooks other modules may call:
  // window.__reportAudioFeaturesError?.(errorLike)
  // window.__hideAudioFeaturesBanner?.()
  (window as any).__reportAudioFeaturesError = show;
  (window as any).__hideAudioFeaturesBanner = hide;

  // Return programmatic controls for callers that import this module.
  return { show, hide };
}