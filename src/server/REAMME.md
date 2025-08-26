# TikTok Live Chat SSE Proxy

Connects to TikTok Live chat using `tiktok-live-connector` on the server, and relays chat messages to browsers via Server-Sent Events (SSE).

## Deploy (Render.com)

1. Create a new Web Service in Render:
   - Connect your repo and select the `server/` directory as the root.
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment: Node 18+
2. After deploy, note the URL, e.g. `https://dwdw-tiktok-proxy.onrender.com`

## Test

- Health: `GET https://YOUR-URL/health` — expect `{"ok":true}`
- SSE: `GET https://YOUR-URL/sse/lmohss` (must be LIVE to see chat events)

## Frontend config

In your site’s `index.html`, set:
```html
<script>
  window.TIKTOK_PROXY_URL = 'https://dwdw-tiktok-proxy.onrender.com';
</script>
```

Now, in the app’s Queue panel, enter your username (or paste your profile URL) and click Connect. The frontend will subscribe to `EventSource(PROXY/sse/:username)` and process viewer commands:
- `!play Song -Artist`
- `!skip`
- `!pause`
- `!resume`
- `!volume 50`