// Cloudflare Worker: CORS-friendly image proxy suitable for TikTok avatars and Spotify art.
// Deploy: wrangler deploy workers/image-proxy.js
// Usage: https://YOUR-SUBDOMAIN.YOUR-ACCOUNT.workers.dev/image-proxy?url=<encoded_target_url>

export default {
  async fetch(request, env, ctx) {
    try {
      const { pathname, searchParams } = new URL(request.url);
      if (!pathname.startsWith('/image-proxy')) {
        return new Response('ok', { status: 200 });
      }
      const target = searchParams.get('url') || '';
      if (!target) {
        return new Response('Missing url param', { status: 400, headers: corsHeaders() });
      }
      // Basic allowlist (optional): only proxy images from these hosts
      const allowHosts = [
        'p16-sign-va.tiktokcdn.com',
        'p16-sign-sg.tiktokcdn.com',
        'p16-sign-useast2.tiktokcdn-us.com',
        'p19-pu-sign-useast8.tiktokcdn-us.com',
        'p77-sign.tiktokcdn-us.com',
        'tiktokcdn-us.com',
        'tiktokcdn.com',
        'image-cdn-ak.spotifycdn.com',
        'i.scdn.co',
        'i.scdn.co',
        'i.pravatar.cc',
        'cdn.discordapp.com',
      ];
      let url;
      try {
        url = new URL(target);
      } catch {
        return new Response('Invalid url', { status: 400, headers: corsHeaders() });
      }
      if (!allowHosts.some(h => url.host.endsWith(h))) {
        // You can relax this if needed
        // return new Response('Host not allowed', { status: 403, headers: corsHeaders() });
      }

      const upstream = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          // Some CDNs require an Accept header
          'Accept': 'image/*;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.8',
          // Optional: spoof a Referer/UA if needed
          'User-Agent': request.headers.get('user-agent') || 'Mozilla/5.0',
        },
        cf: { cacheTtl: 86400, cacheEverything: true },
      });

      // Clone and adjust headers for CORS
      const respHeaders = new Headers(upstream.headers);
      const contentType = respHeaders.get('content-type') || guessContentType(url.pathname);
      const status = upstream.status;
      const body = upstream.body;

      // Ensure CORS and cache headers
      const headers = corsHeaders();
      headers.set('Content-Type', contentType);
      headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');

      // Strip security headers that might conflict in a proxy context
      [
        'content-security-policy', 'content-security-policy-report-only',
        'cross-origin-resource-policy', 'cross-origin-embedder-policy', 'cross-origin-opener-policy',
        'x-frame-options', 'x-content-type-options', 'referrer-policy', 'set-cookie'
      ].forEach(h => respHeaders.delete(h));

      // Merge useful upstream headers (like ETag) if present
      const passthrough = ['etag', 'last-modified'];
      passthrough.forEach((h) => {
        const v = respHeaders.get(h);
        if (v) headers.set(h, v);
      });

      return new Response(body, { status, headers });
    } catch (err) {
      return new Response('Proxy error: ' + (err && err.message ? err.message : 'unknown'), { status: 500, headers: corsHeaders() });
    }
  }
};

function corsHeaders() {
  const h = new Headers();
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  h.set('Access-Control-Allow-Headers', '*, Authorization, Content-Type, If-None-Match, If-Modified-Since');
  return h;
}

function guessContentType(pathname) {
  const ext = pathname.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}