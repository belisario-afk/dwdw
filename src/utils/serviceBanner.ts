// Tiny UI helper: shows a dismissible banner if audio-features fail (e.g., 403).
import { setAudioFeaturesErrorHandler } from '@/lib/spotifyAudioFeatures';

export function initServiceBannerForAudioFeatures() {
  let bannerEl: HTMLDivElement | null = null;
  let closed = false;

  function ensureBanner(): HTMLDivElement {
    if (bannerEl) return bannerEl;
    bannerEl = document.createElement('div');
    bannerEl.className = 'service-banner';
    bannerEl.setAttribute('role', 'status');
    bannerEl.setAttribute('aria-live', 'polite');

    const msg = document.createElement('div');
    msg.className = 'service-banner__msg';

    const close = document.createElement('button');
    close.className = 'service-banner__close';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    close.onclick = () => {
      closed = true;
      bannerEl?.remove();
      bannerEl = null;
    };

    bannerEl.appendChild(msg);
    bannerEl.appendChild(close);
    document.body.appendChild(bannerEl);
    return bannerEl;
  }

  setAudioFeaturesErrorHandler(({ status, detail }) => {
    if (closed) return;
    const el = ensureBanner();
    const msg = el.querySelector('.service-banner__msg') as HTMLDivElement;
    const reason = status === 403
      ? 'Spotify audio features are not available for this account/token (403). Using defaults.'
      : status === 401
      ? 'Spotify token expired/unauthorized (401). Please log in again. Using defaults.'
      : status === 0
      ? 'Network error reaching Spotify audio features. Using defaults.'
      : `Audio features request failed (${status}). Using defaults.`;
    msg.textContent = reason;
    // Optional: add a data-status for styling/tests
    el.setAttribute('data-status', String(status));
    // Keep it visible; if you prefer auto-hide, uncomment below:
    // setTimeout(() => { if (!closed) el.remove(); }, 8000);
  });
}