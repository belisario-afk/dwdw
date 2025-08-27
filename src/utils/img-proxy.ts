// Returns a proxied image URL if a proxy base is configured, otherwise returns the original URL.
// Configure via Vite env (recommended):
//   VITE_IMG_PROXY_BASE=https://image-proxy.tikusers862.workers.dev/
// Or at runtime for testing:
//   window.__IMG_PROXY_BASE = 'https://image-proxy.tikusers862.workers.dev/'
export function getProxiedUrl(url: string | null | undefined): string {
  if (!url) return '';
  const base =
    (import.meta as any)?.env?.VITE_IMG_PROXY_BASE ||
    (window as any)?.__IMG_PROXY_BASE ||
    '';
  if (!base) return String(url);
  try {
    const u = String(url);
    const b = String(base).replace(/\/+$/, ''); // trim trailing slashes
    const sep = b.includes('?') ? '&' : '?';
    return `${b}${sep}url=${encodeURIComponent(u)}`;
  } catch {
    return String(url);
  }
}

// Also export as default for flexibility if someone imports default.
export default getProxiedUrl;