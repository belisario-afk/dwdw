// Runs on app start. Adds classes and CSS variables to adapt HUD/GUI to device.
type ResponsiveClasses =
  | 'device-phone'
  | 'device-tablet'
  | 'device-desktop'
  | 'orientation-portrait'
  | 'orientation-landscape'
  | 'input-touch'
  | 'input-pointer'
  | 'dpr-1'
  | 'dpr-2'
  | 'dpr-3plus';

function classifyWidth(w: number): 'device-phone' | 'device-tablet' | 'device-desktop' {
  if (w < 600) return 'device-phone';
  if (w < 1024) return 'device-tablet';
  return 'device-desktop';
}

function classifyDPR(dpr: number): 'dpr-1' | 'dpr-2' | 'dpr-3plus' {
  if (dpr < 1.5) return 'dpr-1';
  if (dpr < 2.5) return 'dpr-2';
  return 'dpr-3plus';
}

function setVar(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

function updateViewportVars() {
  // “Real” vw/vh units to avoid mobile browser UI bars issues
  const vw = window.innerWidth / 100;
  const vh = window.innerHeight / 100;
  setVar('--vw', `${vw}px`);
  setVar('--vh', `${vh}px`);
}

function updateClasses() {
  const html = document.documentElement;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;

  const device = classifyWidth(w);
  const orientation = h >= w ? 'orientation-portrait' : 'orientation-landscape';
  const dprClass = classifyDPR(dpr);
  const pointerCoarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;

  const classes: ResponsiveClasses[] = [
    device,
    orientation,
    pointerCoarse ? 'input-touch' : 'input-pointer',
    dprClass,
  ];

  // Remove old classes we control
  html.classList.remove(
    'device-phone',
    'device-tablet',
    'device-desktop',
    'orientation-portrait',
    'orientation-landscape',
    'input-touch',
    'input-pointer',
    'dpr-1',
    'dpr-2',
    'dpr-3plus'
  );
  // Add new
  html.classList.add(...classes);

  // Optional data attributes if you prefer querying in JS/CSS
  html.setAttribute('data-device', device.replace('device-', ''));
  html.setAttribute('data-orientation', orientation.replace('orientation-', ''));
  html.setAttribute('data-pointer', pointerCoarse ? 'touch' : 'pointer');
  html.setAttribute('data-dpr', dpr.toString());
}

export function initResponsiveHUD() {
  // Initial paint
  updateViewportVars();
  updateClasses();

  // Listen for changes
  let rafId = 0;
  const schedule = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      updateViewportVars();
      updateClasses();
    });
  };

  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule);
  // Pointer/hover capability can change on some devices (rare), but safe to include:
  window.matchMedia?.('(pointer: coarse)').addEventListener?.('change', schedule);

  // Expose for manual refresh if needed
  (window as any).__refreshHUDResponsive = schedule;
}