/* eslint-disable no-console */
const express = require('express');
const cors = require('cors');

let WebcastPushConnection;
try {
  ({ WebcastPushConnection } = require('tiktok-live-connector'));
} catch (e) {
  console.error('Failed to load tiktok-live-connector', e);
}

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: '*', methods: ['GET'], allowedHeaders: ['*'] }));
app.set('x-powered-by', false);

app.get('/health', (_req, res) => res.json({ ok: true }));

// username -> { conn, clients:Set<res>, pingTimer }
const connections = new Map();

function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no'); // avoid proxy buffering
  res.flushHeaders?.();
}

function broadcast(username, event, data) {
  const entry = connections.get(username);
  if (!entry) return;
  const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of entry.clients) {
    try { client.write(line); } catch {}
  }
}

async function maybeClose(username) {
  const entry = connections.get(username);
  if (!entry) return;
  if (entry.clients.size === 0) {
    try { clearInterval(entry.pingTimer); } catch {}
    try { await entry.conn?.disconnect(); } catch {}
    connections.delete(username);
    console.log(`[${username}] disconnected (no clients)`);
  }
}

app.get('/sse/:username', async (req, res) => {
  const username = String(req.params.username || '').trim().replace(/^@/, '');
  if (!username || !/^[A-Za-z0-9._-]{2,24}$/.test(username)) {
    return res.status(400).json({ error: 'invalid username' });
  }
  if (!WebcastPushConnection) {
    return res.status(500).json({ error: 'connector not available on server' });
  }

  sseHeaders(res);

  let entry = connections.get(username);
  if (!entry) {
    const conn = new WebcastPushConnection(username, { enableExtendedGiftInfo: false });
    entry = { conn, clients: new Set(), pingTimer: null };

    conn.on('chat', (data) => {
      broadcast(username, 'message', {
        type: 'chat',
        user: data?.uniqueId || data?.nickname || 'user',
        comment: data?.comment || ''
      });
    });

    conn.on('streamEnd', () => broadcast(username, 'message', { type: 'info', message: 'Stream ended' }));
    conn.on('disconnected', () => broadcast(username, 'message', { type: 'info', message: 'Disconnected' }));
    conn.on('error', (e) => broadcast(username, 'message', { type: 'error', message: e?.message || 'unknown error' }));

    try {
      await conn.connect();
      console.log(`[${username}] connected to TikTok`);
      broadcast(username, 'message', { type: 'info', message: 'Connected to TikTok' });
    } catch (e) {
      console.error(`[${username}] connect failed`, e?.message || e);
      res.write(`event: message\ndata: ${JSON.stringify({ type: 'error', message: 'Failed to connect (are you LIVE and is the username correct?)' })}\n\n`);
      setTimeout(() => res.end(), 1500);
      return;
    }

    // Keepalive pings
    entry.pingTimer = setInterval(() => {
      try { broadcast(username, 'ping', { t: Date.now() }); } catch {}
    }, 15000);

    connections.set(username, entry);
  }

  entry.clients.add(res);
  res.write(`event: message\ndata: ${JSON.stringify({ type: 'info', message: `SSE connected for @${username}` })}\n\n`);

  req.on('close', () => {
    entry.clients.delete(res);
    maybeClose(username);
  });
});

app.get('/', (_req, res) => {
  res.type('text/plain').send('TikTok proxy is running. GET /sse/:username while the account is LIVE.');
});

const server = app.listen(PORT, () => console.log(`TikTok proxy listening on :${PORT}`));
server.keepAliveTimeout = 75_000;
server.headersTimeout = 80_000;