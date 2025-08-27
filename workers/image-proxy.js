// Cloudflare Worker image proxy to add CORS headers.
// Deploy with wrangler, then set VITE_IMG_PROXY_BASE to this worker URL.
export default {
  async fetch(req, env, ctx) {
    try {
      const { searchParams } = new URL(req.url);
      const target = searchParams.get('url');
      if (!target) return new Response('missing url', { status: 400 });
      const upstream = await fetch(target, {
        headers: { 'User-Agent': 'streamqueue-proxy' },
      });
      const headers = new Headers(upstream.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', 'public, max-age=3600, immutable');
      // Strip security headers that can block embedding
      headers.delete('content-security-policy');
      headers.delete('content-security-policy-report-only');
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch (e) {
      return new Response('proxy error', { status: 502 });
    }
  }
};