import { Emitter } from '@utils/emitter';

type AuthOptions = {
  clientId: string;
  redirectUri: string;
  scopes: string[];
};

type TokenResponse = {
  access_token: string;
  token_type: 'Bearer';
  scope: string;
  expires_in: number;
  refresh_token?: string;
};

type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string[];
};

export class Auth extends Emitter<{ tokens: (t: TokenSet | null) => void }> {
  private tokens: TokenSet | null = null;
  private storageKey = 'dwdw.tokens';
  private verifierKey = 'dwdw.pkce.verifier';
  private stateKey = 'dwdw.pkce.state';

  constructor(private opts: AuthOptions) {
    super();
  }

  getAccessToken(): string | null {
    if (!this.tokens) return null;
    if (Date.now() > this.tokens.expiresAt - 60_000) return null;
    return this.tokens.accessToken;
  }

  isAuthenticated() {
    return !!this.getAccessToken();
  }

  async restore(): Promise<boolean> {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as TokenSet;
      this.tokens = parsed;
      if (Date.now() > parsed.expiresAt - 60_000) {
        if (parsed.refreshToken) {
          await this.refresh().catch(() => {});
          return !!this.getAccessToken();
        }
        return false;
      }
      this.emit('tokens', this.tokens);
      return true;
    } catch {
      return false;
    }
  }

  async login() {
    const verifier = this.generateCodeVerifier();
    const challenge = await this.generateCodeChallenge(verifier);
    const state = crypto.randomUUID();

    sessionStorage.setItem(this.verifierKey, verifier);
    sessionStorage.setItem(this.stateKey, state);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.opts.clientId,
      scope: this.opts.scopes.join(' '),
      redirect_uri: this.opts.redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state
    });
    location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  async logout() {
    this.tokens = null;
    localStorage.removeItem(this.storageKey);
    this.emit('tokens', null);
  }

  // Tolerant handler: only throws on the actual callback route with bad/missing params.
  async handleRedirectCallback(): Promise<void> {
    const url = new URL(location.href);
    const hash = url.hash || '';
    const isCallbackRoute = url.pathname.endsWith('/callback') || hash.startsWith('#/callback');

    // Choose params from either ?search or the part after "#/callback?"
    let params: URLSearchParams;
    if (url.search.length > 1) {
      params = url.searchParams;
    } else if (hash.startsWith('#/')) {
      const qi = hash.indexOf('?');
      params = qi !== -1 ? new URLSearchParams(hash.slice(qi + 1)) : new URLSearchParams();
    } else {
      params = new URLSearchParams();
    }

    const code = params.get('code');
    const state = params.get('state');
    const storedState = sessionStorage.getItem(this.stateKey);
    const verifier = sessionStorage.getItem(this.verifierKey);

    // If this isn't a callback URL, just ignore silently.
    if (!isCallbackRoute && !(code && state)) return;

    // On callback route, validate strictly.
    if (!code || !state || !verifier || state !== storedState) {
      throw new Error('Invalid OAuth callback.');
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.opts.redirectUri,
      client_id: this.opts.clientId,
      code_verifier: verifier
    });

    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!resp.ok) throw new Error('Token exchange failed: ' + (await resp.text()));
    const data = (await resp.json()) as TokenResponse;

    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope.split(' ')
    };
    localStorage.setItem(this.storageKey, JSON.stringify(this.tokens));
    sessionStorage.removeItem(this.verifierKey);
    sessionStorage.removeItem(this.stateKey);
    this.emit('tokens', this.tokens);

    // Clean URL (remove code/state from hash or search)
    try {
      const clean = this.cleanUrl(url);
      history.replaceState({}, '', clean);
    } catch {}
  }

  private cleanUrl(url: URL): string {
    // Normalize to app root with hash route
    const base = `${url.origin}${url.pathname.replace(/\/callback\/?$/, '/')}`;
    if (url.hash.startsWith('#/callback')) return base + '#/';
    if (url.search) return base + url.hash; // drop ?code if any
    return base + url.hash;
  }

  async refresh(): Promise<void> {
    if (!this.tokens?.refreshToken) throw new Error('No refresh token');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.tokens.refreshToken,
      client_id: this.opts.clientId
    });
    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!resp.ok) throw new Error('Refresh failed');
    const data = (await resp.json()) as TokenResponse;
    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || this.tokens.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope.split(' ')
    };
    localStorage.setItem(this.storageKey, JSON.stringify(this.tokens));
    this.emit('tokens', this.tokens);
  }

  private generateCodeVerifier(): string {
    const arr = new Uint8Array(64);
    crypto.getRandomValues(arr);
    return b64url(arr);
    function b64url(bytes: Uint8Array): string {
      let s = '';
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(digest);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
}