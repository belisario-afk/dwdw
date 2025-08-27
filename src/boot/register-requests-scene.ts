// Import this once in your app entry so the scene registers.
import '../scenes/requests-scene';

// Optional: force-switch to the scene for testing after director starts.
setTimeout(() => {
  (window as any).__director?.requestScene?.('Requests Floaters');
}, 1200);