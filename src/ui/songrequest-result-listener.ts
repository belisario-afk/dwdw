window.addEventListener('songrequest:result', (e: any) => {
  const { ok, status, message } = e.detail || {};
  if (ok) console.log('Queued on Spotify ✅');
  else console.warn('Queue failed', status, message);
});