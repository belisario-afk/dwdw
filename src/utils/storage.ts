export class Cache {
  constructor(private prefix: string) {}
  key(k: string) { return `${this.prefix}:${k}`; }
  get<T>(k: string): T | null {
    const raw = localStorage.getItem(this.key(k));
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }
  set<T>(k: string, v: T) { localStorage.setItem(this.key(k), JSON.stringify(v)); }
  del(k: string) { localStorage.removeItem(this.key(k)); }
}

export async function cacheWithEtag(key: string, fetcher: () => Promise<Response>): Promise<Response> {
  const etagKey = key + ':etag';
  const bodyKey = key + ':body';
  const etag = localStorage.getItem(etagKey);
  const resp = await fetcher();
  const newEtag = resp.headers.get('ETag');
  if (resp.ok) {
    const text = await resp.text();
    localStorage.setItem(bodyKey, text);
    if (newEtag) localStorage.setItem(etagKey, newEtag);
    return new Response(text, { status: 200, headers: { 'Content-Type': resp.headers.get('Content-Type') || 'application/json' } });
  }
  if (etag) {
    const text = localStorage.getItem(bodyKey) || '';
    return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return resp;
}