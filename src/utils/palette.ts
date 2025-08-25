import tinycolor from 'tinycolor2';

export type PaletteOut = { dominant: string; secondary: string; colors: string[] };

export const Palette = {
  async fromImageURL(url: string): Promise<PaletteOut> {
    const img = await loadImage(url);
    const { colors } = quantize(img, 8);
    const sorted = colors.map(c => ({ c, l: tinycolor(c).getLuminance() }))
      .sort((a, b) => b.l - a.l).map(o => o.c);
    const dom = colors[0];
    const sec = sorted[Math.floor(sorted.length / 2)] || colors[1] || dom;
    document.documentElement.style.setProperty('--panel', tinycolor(sec).setAlpha(0.7).toRgbString());
    return { dominant: dom, secondary: sec, colors };
  }
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

function quantize(img: HTMLImageElement, k = 8) {
  const cvs = document.createElement('canvas');
  const w = (cvs.width = 256);
  const h = (cvs.height = Math.round(256 * img.height / img.width));
  const ctx = cvs.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const pts: number[][] = [];
  for (let i = 0; i < data.length; i += 4 * 16) {
    pts.push([data[i], data[i + 1], data[i + 2]]);
  }
  let means = new Array(k).fill(0).map((_, i) => pts[(i * 131) % pts.length]);
  for (let iter = 0; iter < 10; iter++) {
    const clusters: number[][][] = Array.from({ length: k }, () => []);
    for (const p of pts) {
      let bi = 0, bd = 1e9;
      for (let i = 0; i < k; i++) {
        const d = dist2(p, means[i]);
        if (d < bd) { bd = d; bi = i; }
      }
      clusters[bi].push(p);
    }
    for (let i = 0; i < k; i++) {
      const c = clusters[i];
      if (!c.length) continue;
      const mean = [0, 0, 0];
      for (const p of c) { mean[0] += p[0]; mean[1] += p[1]; mean[2] += p[2]; }
      means[i] = [mean[0] / c.length, mean[1] / c.length, mean[2] / c.length];
    }
  }
  const colors = means.map(m => tinycolor({ r: m[0], g: m[1], b: m[2] }).toHexString());
  return { colors };
}

function dist2(a: number[], b: number[]) {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}