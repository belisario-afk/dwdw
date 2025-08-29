// Cloudflare Worker: Robust CORS-friendly image proxy with TikTok compatibility.
// Deploy with: wrangler deploy workers/image-proxy-robust.js
// Use in app: window.QUEUE_FLOATER_IMAGE_PROXY = 'https://YOUR-SUBDOMAIN.YOUR-ACCOUNT.workers.dev/image-proxy?url=';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health
    if (url.pathname === '/' || url.pathname === '/healthz') {
      return new Response('ok', { status: 200, headers: corsHeaders() });
    }

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers: corsHeaders() });
    }

    // HEAD passthrough (basic)
    if (request.method === 'HEAD') {
      // Treat like GET but drop body later
    }

    if (url.pathname.startsWith('/image-proxy')) {
      return handleImageProxy(request, url);
    }

    // Optional: scrape TikTok avatar by username (server-side)
    // GET /avatar?user=<uniqueId>
    if (url.pathname.startsWith('/avatar')) {
      const uniqueId = url.searchParams.get('user') || '';
      if (!uniqueId) {
        return json({ error: 'Missing ?user=' }, 400);
      }
      try {
        const avatarUrl = await fetchTikTokAvatar(uniqueId);
        if (!avatarUrl) {
          return json({ error: 'Avatar not found' }, 404);
        }
        return json({ user: uniqueId, avatar: avatarUrl }, 200);
      } catch (e) {
        return json({ error: 'Avatar fetch failed', detail: String(e && e.message || e) }, 500);
      }
    }

    return new Response('Not found', { status: 404, headers: corsHeaders() });
  }
};

async function handleImageProxy(request, url) {
  const target = url.searchParams.get('url') || '';
  if (!target) {
    return new Response('Missing url param', { status: 400, headers: corsHeaders() });
  }

  let upstreamUrl;
  try {
    upstreamUrl = new URL(target);
  } catch {
    return new Response('Invalid url', { status: 400, headers: corsHeaders() });
  }

  // Enforce HTTPS and pixel-only schemes
  if (upstreamUrl.protocol !== 'https:') {
    return new Response('Only https is allowed', { status: 400, headers: corsHeaders() });
  }

  // Allowlist (adjust as needed)
  const allowHosts = [
    // TikTok CDNs (add more variants if needed)
    'tiktokcdn.com',
    'tiktokcdn-us.com',
    'tiktokcdn-eu.com',
    'tiktokcdn-asia.com',
    'p16-sign-va.tiktokcdn.com',
    'p16-sign-sg.tiktokcdn.com',
    'p16-sign-useast2.tiktokcdn-us.com',
    'p19-pu-sign-useast8.tiktokcdn-us.com',
    'p77-sign.tiktokcdn-us.com',
    // Spotify art
    'image-cdn-ak.spotifycdn.com',
    'i.scdn.co',
    // Generic avatar CDNs
    'i.pravatar.cc',
    'cdn.discordapp.com',
    'images.weserv.nl'
  ];
  const isAllowed = allowHosts.some((h) => upstreamUrl.host === h || upstreamUrl.host.endsWith('.' + h));
  if (!isAllowed) {
    // Comment out to allow any host:
    // return new Response('Host not allowed', { status: 403, headers: corsHeaders() });
  }

  // Build upstream headers
  const reqHeaders = new Headers();
  // Accept images; some CDNs vary content by Accept/Language
  reqHeaders.set('Accept', 'image/avif,image/webp,image/apng,image/*;q=0.8,*/*;q=0.5');
  reqHeaders.set('Accept-Language', 'en-US,en;q=0.8');

  // Emulate a realistic User-Agent
  const ua = request.headers.get('user-agent') ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
  reqHeaders.set('User-Agent', ua);

  // Some TikTok CDNs require a TikTok referer; inject for TikTok hosts
  if (isTikTokHost(upstreamUrl.host)) {
    reqHeaders.set('Referer', 'https://www.tiktok.com/');
  }

  // Forward Range (partial content)
  const range = request.headers.get('Range');
  if (range) reqHeaders.set('Range', range);

  // Conditional headers (help caching)
  const inm = request.headers.get('If-None-Match');
  const ims = request.headers.get('If-Modified-Since');
  if (inm) reqHeaders.set('If-None-Match', inm);
  if (ims) reqHeaders.set('If-Modified-Since', ims);

  // Fetch options
  const fetchOpts = {
    method: 'GET',
    headers: reqHeaders,
    redirect: 'follow',
    cf: {
      cacheTtl: 86400,
      cacheEverything: true
    }
  };

  // Try cache first (if using the built-in cache)
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) {
    // Serve cached with CORS headers
    const resp = new Response(cached.body, { headers: mergeForCORS(cached.headers) , status: cached.status });
    return resp;
  }

  // Fetch upstream
  let upstream;
  try {
    upstream = await fetch(upstreamUrl.toString(), fetchOpts);
  } catch (e) {
    return new Response('Upstream fetch error', { status: 502, headers: corsHeaders() });
  }

  // 304 passthrough
  if (upstream.status === 304) {
    const headers = corsHeaders();
    copyIf(headers, upstream.headers, ['etag', 'last-modified', 'content-type']);
    return new Response('', { status: 304, headers });
  }

  // Copy headers, normalize for CORS
  const respHeaders = new Headers(corsHeaders());
  // Content-Type: trust upstream, fallback by extension
  const ct = upstream.headers.get('content-type') || guessContentType(upstreamUrl.pathname);
  respHeaders.set('Content-Type', ct);

  // Cache controls
  respHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');

  // Pass through validators if present
  copyIf(respHeaders, upstream.headers, ['etag', 'last-modified', 'content-length', 'accept-ranges']);

  // Strip security headers that can break embedding
  stripHeaders(upstream.headers, [
    'content-security-policy',
    'content-security-policy-report-only',
    'cross-origin-embedder-policy',
    'cross-origin-opener-policy',
    'cross-origin-resource-policy',
    'x-frame-options',
    'x-content-type-options',
    'referrer-policy',
    'set-cookie'
  ]);

  // If partial content requested and honored upstream, preserve status 206
  const status = upstream.status;

  // Stream the body and put into cache (only cache 200 OK)
  const body = upstream.body;
  const response = new Response(body, { status, headers: respHeaders });

  if (status === 200) {
    ctxWait(caches.default.put(cacheKey, response.clone()));
  }

  return response;
}

function isTikTokHost(host) {
  return /(^|\.)tiktokcdn(?:-[a-z]+)?\.com$/.test(host) || /(^|\.)tiktokcdn-[a-z]+\.com$/.test(host) || /(^|\.)tiktokcdn-us\.com$/.test(host);
}

function corsHeaders() {
  const h = new Headers();
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  h.set('Access-Control-Allow-Headers', '*, Authorization, Content-Type, If-None-Match, If-Modified-Since, Range');
  h.set('Access-Control-Expose-Headers', 'Content-Type, ETag, Last-Modified, Accept-Ranges, Content-Length');
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
    case 'avif': return 'image/avif';
    default: return 'application/octet-stream';
  }
}

function copyIf(dst, src, names) {
  names.forEach((n) => {
    const v = src.get(n);
    if (v) dst.set(n, v);
  });
}

function stripHeaders(src, names) {
  names.forEach((n) => {
    if (src.has(n)) src.delete(n);
  });
}

function json(obj, status = 200) {
  const h = corsHeaders();
  h.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(obj), { status, headers: h });
}

function ctxWait(promise) {
  try {
    // In newer runtimes, we might have execution context; ignore if not
    // eslint-disable-next-line no-undef
    if (typeof ctx !== 'undefined' && ctx && typeof ctx.waitUntil === 'function') {
      // eslint-disable-next-line no-undef
      ctx.waitUntil(promise);
    }
  } catch {}
}

/* Optional: server-side TikTok avatar scraping by username.
   Tries to fetch the user's page and extract avatar URL from embedded JSON.
   This can break if TikTok changes their page structure. */
async function fetchTikTokAvatar(uniqueId) {
  const profileUrl = `https://www.tiktok.com/@${encodeURIComponent(uniqueId)}?lang=en`;
  const res = await fetch(profileUrl, {
    method: 'GET',
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      'Referer': 'https://www.tiktok.com/'
    },
    redirect: 'follow',
    cf: { cacheTtl: 3600, cacheEverything: true }
  });
  if (!res.ok) return '';

  const html = await res.text();
  // Look for SIGI_STATE JSON
  const m = html.match(/<script[^>]*id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return '';
  try {
    const sigi = JSON.parse(m[1]);
    const users = sigi?.UserModule?.users || {};
    const user = users[uniqueId] || Object.values(users)[0];
    const avatar = user?.avatarLarger || user?.avatarMedium || user?.avatarThumb || '';
    return avatar || '';
  } catch {
    return '';
  }
}