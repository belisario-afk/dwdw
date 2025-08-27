// CORS-resilient image loader (quiet):
// - Try WITHOUT crossOrigin first (avoids console CORS errors on strict hosts)
// - If that fails, retry WITH crossOrigin="anonymous"
// We don't read pixels in Requests Floaters, so a tainted canvas is fine.
export function loadImageSafe(url: string): Promise<HTMLImageElement | null> {
  if (!url || typeof url !== 'string') return Promise.resolve(null);

  const attempt = (src: string, useCors: boolean) =>
    new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      try { img.decoding = 'async'; } catch {}
      try { img.loading = 'eager'; } catch {}
      img.referrerPolicy = 'no-referrer';
      if (useCors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

  // Try without crossOrigin first, then retry with it
  return attempt(url, false).then((a) => a || attempt(url, true));
}

// Also export default so either import style works
export default loadImageSafe;