// CORS-resilient image loader:
// 1) Try loading with crossOrigin="anonymous" (keeps canvas untainted if server allows CORS).
// 2) If it fails, retry without crossOrigin (taints canvas, but drawImage still works).
// We don't read pixels in Requests Floaters, so tainting is acceptable.
export async function loadImageSafe(url: string): Promise<HTMLImageElement | null> {
  if (!url || typeof url !== 'string') return null;

  const attempt = (src: string, useCors: boolean) =>
    new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      try { img.decoding = 'async'; } catch {}
      try { img.loading = 'eager'; } catch {}
      if (useCors) img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

  // Try with CORS first
  const a = await attempt(url, true);
  if (a) return a;

  // Retry without CORS
  const b = await attempt(url, false);
  return b;
}