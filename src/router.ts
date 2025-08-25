export function ensureRoute() {
  // Normalize empty hash to "#/"
  if (!location.hash || location.hash === '#') {
    history.replaceState({}, '', location.pathname + location.search + '#/');
    return;
  }
  // If the OAuth flow dropped us on "#/callback?...",
  // normalize back to "#/" — pkce.ts will already have handled code/state.
  if (location.hash.startsWith('#/callback')) {
    const clean = new URL(location.href);
    clean.hash = '#/';
    // also strip any code/state leftover in search
    clean.searchParams.delete('code');
    clean.searchParams.delete('state');
    clean.searchParams.delete('error');
    history.replaceState({}, '', clean.toString());
  }
}