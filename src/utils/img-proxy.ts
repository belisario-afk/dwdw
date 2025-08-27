export function getProxiedUrl(url: string | null | undefined): string {
  if (!url) return '';
  const base =
    (import.meta as any).env?.VITE_IMG_PROXY_BASE ||
    (window as any).__IMG_PROXY_BASE ||
    '';
  if (!base) return url;
  try {
    const u = String(url);
    const b = String(base).replace(/\/+$/, '');
    const sep = b.includes('?') ? '&' : '?';
    return `${b}${sep}url=${encodeURIComponent(u)}`;
  } catch {
    return url;
  }
}