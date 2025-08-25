export function ensureRoute() {
  if (!location.hash) {
    if (location.pathname.endsWith('/callback')) {
      // handled by main.ts after callback forwarder
    } else {
      location.hash = '#/';
    }
  }
  window.addEventListener('popstate', () => {});
}