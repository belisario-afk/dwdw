// Runs before main.ts. Detects Spotify API 401/403 and shows a fix banner with a one-click reset.
// Also computes and displays your current redirect URI so you can add it to the Spotify Dashboard.
// NOTE: This does NOT silence 403s; it helps you fix the cause (app config/Premium).

type G = typeof globalThis & {
  __SPOTIFY_GUARD_SHOWN?: boolean;
  __SPOTIFY_LAST_STATUS?: number;
};

const g = globalThis as G;

function computeRedirect(): string {
  // This matches how your app computes redirect in main.ts: new URL(import.meta.env.BASE_URL, location.origin)
  // We can't read import.meta.env here, so we approximate: ensure trailing slash on the current "base".
  // If your app is served under a subpath (like GitHub Pages /dwdw/), keep it.
  try {
    let origin = location.origin;
    let path = location.pathname;
    // If Vite base is /dwdw/, path should start with /dwdw/
    // Normalize to the first path segment + trailing slash
    const parts = path.split('/').filter(Boolean);
    if (parts.length >= 1) {
      // likely /<repo>/
      return origin + '/' + parts[0] + '/';
    }
    return origin + '/';
  } catch {
    return location.origin + '/';
  }
}

function buildAuthorizeTestURL(): string {
  const redirect = encodeURIComponent(computeRedirect());
  const scopes = encodeURIComponent([
    'user-read-email',
    'user-read-private',
    'streaming',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'playlist-read-private',
    'user-library-read'
  ].join(' '));
  // Dummy code_challenge for quick redirect-uri validation
  const cc = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-abcdefgh';
  const clientId = '927fda6918514f96903e828fcd6bb576';
  return `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirect}&code_challenge_method=S256&code_challenge=${cc}&scope=${scopes}`;
}

function showBanner(status: number) {
  if (g.__SPOTIFY_GUARD_SHOWN) return;
  g.__SPOTIFY_GUARD_SHOWN = true;

  const redirect = computeRedirect();
  const authTestURL = buildAuthorizeTestURL();

  const wrap = document.createElement('div');
  wrap.className = 'auth-banner';
  wrap.innerHTML = `
    <b>Spotify returned ${status} (Forbidden/Unauthorized)</b>
    <div>To fully fix this (100%):</div>
    <ol style="margin:6px 0 8px 18px; padding:0;">
      <li>In Spotify Developer Dashboard → your app (client_id: <code>927fda6918514f96903e828fcd6bb576</code>):
        <ul style="margin:4px 0 6px 0; padding-left: 16px;">
          <li>Make the app Live OR add your Spotify account under “Users and access”.</li>
          <li>Ensure the account you log in with is Premium.</li>
          <li>Under “Redirect URIs”, add exactly: <code>${redirect}</code> (including trailing slash).</li>
        </ul>
      </li>
      <li>Reset your login below and re‑authenticate.</li>
    </ol>
    <div class="auth-actions">
      <button id="btn-auth-reset">Reset Spotify login</button>
      <button class="secondary" id="btn-auth-dismiss">Dismiss</button>
      <a href="${authTestURL}" target="_blank" rel="noopener">Check redirect URI (opens Accounts)</a>
    </div>
  `.trim();

  document.body.appendChild(wrap);

  const btnReset = wrap.querySelector('#btn-auth-reset') as HTMLButtonElement;
  const btnDismiss = wrap.querySelector('#btn-auth-dismiss') as HTMLButtonElement;

  btnReset.onclick = () => {
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
    // Log out from Spotify Accounts and revoke app access
    window.open('https://accounts.spotify.com/logout', '_blank', 'noopener');
    window.open('https://www.spotify.com/account/apps/', '_blank', 'noopener');
    setTimeout(() => location.reload(), 800);
  };
  btnDismiss.onclick = () => { wrap.remove(); };
}

(function patchFetchForDetection() {
  const origFetch = g.fetch?.bind(g);
  if (!origFetch) return;

  g.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;

    const isSpotifyAPI = typeof url === 'string' && url.startsWith('https://api.spotify.com/v1/');
    const resp = await origFetch(input as any, init);

    if (isSpotifyAPI && (resp.status === 401 || resp.status === 403)) {
      g.__SPOTIFY_LAST_STATUS = resp.status;
      showBanner(resp.status);
    }
    return resp;
  };
})();