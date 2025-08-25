import { Emitter } from '@utils/emitter';

type AuthOptions = {
  clientId: string;
  redirectUri: string; // Should be the app base, e.g. https://.../dwdw/ or http://127.0.0.1:5173/
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
  private tokensKey = 'dwdw.tokens';
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
      const raw = localStorage.getItem(this.tokensKey);
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

    // Store in both session and local to be resilient across some browser flows
    sessionStorage.setItem(this.verifierKey, verifier);
    sessionStorage.setItem(this.stateKey, state);
    localStorage.setItem(this.verifierKey, verifier);
    localStorage.setItem(this.stateKey, state);

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
    localStorage.removeItem(this.tokensKey);
    this.emit('tokens', null);
  }

  // Returns true if handled an OAuth response, false otherwise. Never throws on normal app loads.
  async handleRedirectCallback(): Promise<boolean> {
    const url = new URL(location.href);
    const params = url.searchParams;

    const hasAuthParams = params.has('code') || params.has('state') || params.has('error');
    if (!hasAuthParams) return false;

    const error = params.get('error');
    if (error) {
      console.warn('OAuth error:', error, params.get('error_description') || '');
      this.cleanAuthParams(url);
      return false;
    }

    const code = params.get('code');
    const state = params.get('state');
    const storedState = sessionStorage.getItem(this.stateKey) || localStorage.getItem(this.stateKey);
    const verifier = sessionStorage.getItem(this.verifierKey) || localStorage.getItem(this.verifierKey);

    if (!code || !state || !verifier || state !== storedState) {
      console.warn('Invalid OAuth callback (missing/mismatched params).');
      this.cleanAuthParams(url); // clean up and let user try again
      return false;
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
    if (!resp.ok) {
      console.error('Token exchange failed:', await resp.text());
      this.cleanAuthParams(url);
      return false;
    }
    const data = (await resp.json()) as TokenResponse;

    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope.split(' ')
    };
    localStorage.setItem(this.tokensKey, JSON.stringify(this.tokens));
    this.emit('tokens', this.tokens);

    // Cleanup verifier/state from both storages
    sessionStorage.removeItem(this.verifierKey);
    sessionStorage.removeItem(this.stateKey);
    localStorage.removeItem(this.verifierKey);
    localStorage.removeItem(this.stateKey);

    // Clean URL (remove ?code&state&error) but keep any hash
    this.cleanAuthParams(url);
    return true;
  }

  private cleanAuthParams(url: URL) {
    const clean = new URL(url.toString());
    clean.searchParams.delete('code');
    clean.searchParams.delete('state');
    clean.searchParams.delete('error');
    history.replaceState({}, '', clean.toString());
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
    localStorage.setItem(this.tokensKey, JSON.stringify(this.tokens));
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