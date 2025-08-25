export type RGB = { r: number; g: number; b: number };

// Parse #rgb or #rrggbb
export function hexToRgb(hex: string): RGB | null {
  const m = hex.trim().replace('#', '');
  const s = m.length === 3 ? m.split('').map((x) => x + x).join('') : m;
  if (s.length !== 6) return null;
  const n = Number.parseInt(s, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const h = (n: number) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  let rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      case bn: h = (rn - gn) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, l };
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255)
  };
}

export function shiftHueHex(hex: string, hue: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const { s, l } = rgbToHsl(rgb);
  return rgbToHex(hslToRgb(hue, s, l));
}

export function blendHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  if (!A || !B) return a;
  return rgbToHex({
    r: Math.round(A.r + (B.r - A.r) * t),
    g: Math.round(A.g + (B.g - A.g) * t),
    b: Math.round(A.b + (B.b - A.b) * t)
  });
}

// Shortest signed angular delta in degrees (-180..180]
export function angularDelta(current: number, target: number): number {
  return ((target - current + 540) % 360) - 180;
}

// Tint an RGB color toward a target hue by amount 0..1
export function tintRgbTowardHue(c: RGB, hue: number, amt: number): RGB {
  if (amt <= 0) return c;
  const hsl = rgbToHsl(c);
  const tgt = hslToRgb(hue, Math.max(0.45, hsl.s), hsl.l);
  return {
    r: Math.round(c.r + (tgt.r - c.r) * amt),
    g: Math.round(c.g + (tgt.g - c.g) * amt),
    b: Math.round(c.b + (tgt.b - c.b) * amt)
  };
}