// Simple "Boxing" scene with two fighters and a ring.
// Audio reactivity comes from onBeat/onDownbeat hooks fired by the director.
// All state is kept inside this module.

import type { VisualDirector, SceneDef } from '@controllers/director';

type Boxer = {
  side: 'left' | 'right';
  idlePhase: number;
  punchT: number; // 0..1, time since punch started (decays)
  hue: number;
};

export function registerBoxingScene(director: VisualDirector) {
  const state = {
    left: { side: 'left', idlePhase: Math.random() * Math.PI * 2, punchT: 0, hue: 210 } as Boxer, // blue
    right: { side: 'right', idlePhase: Math.random() * Math.PI * 2, punchT: 0, hue: 0 } as Boxer, // red
    beatFlip: false,
    flash: 0, // ring flash on downbeats/punch impacts
    camShake: 0,
  };

  const scene: SceneDef = {
    name: 'Boxing',
    draw: (ctx, w, h, time, dt) => {
      // decay timers
      state.left.punchT = Math.max(0, state.left.punchT - dt * 2.2);
      state.right.punchT = Math.max(0, state.right.punchT - dt * 2.2);
      state.flash = Math.max(0, state.flash - dt * 2.0);
      state.camShake = Math.max(0, state.camShake - dt * 2.8);

      // camera shake
      const shakeAmp = Math.min(8, Math.max(0, Math.round(state.camShake * 12)));
      const sx = (Math.random() - 0.5) * shakeAmp;
      const sy = (Math.random() - 0.5) * shakeAmp;

      ctx.save();
      ctx.translate(sx, sy);

      drawBackground(ctx, w, h, state.flash);
      drawRing(ctx, w, h);
      drawBoxer(ctx, w, h, time, dt, state.left);
      drawBoxer(ctx, w, h, time, dt, state.right);
      drawHUD(ctx, w, h);
      ctx.restore();
    },
    onBeat: () => {
      state.beatFlip = !state.beatFlip;
      if (state.beatFlip) state.left.punchT = 1;
      else state.right.punchT = 1;
      state.camShake = Math.min(1, state.camShake + 0.5);
      state.flash = Math.min(1, state.flash + 0.25);
    },
    onDownbeat: () => {
      state.camShake = 1;
      state.flash = 1;
    },
  };

  director.registerScene(scene);
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, flash: number) {
  // vignette + subtle gradient, brightens briefly on flash
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, `rgba(6, 8, 12, ${0.95 - flash * 0.2})`);
  g.addColorStop(1, `rgba(10, 12, 18, ${1 - flash * 0.2})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.globalAlpha = 0.08 + flash * 0.1;
  ctx.fillStyle = '#ffffff';
  for (let yy = 0; yy < h; yy += 4) ctx.fillRect(0, yy, w, 1);
  ctx.globalAlpha = 1;
}

function drawRing(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w * 0.5;
  const top = h * 0.32;
  const floorH = h * 0.44;
  const floorTop = top + h * 0.1;

  // perspective floor (trapezoid)
  const floorWTop = w * 0.36;
  const floorWBot = w * 0.84;
  const floorBot = floorTop + floorH;

  const floorGrad = ctx.createLinearGradient(0, floorTop, 0, floorBot);
  floorGrad.addColorStop(0, '#1a1f2a');
  floorGrad.addColorStop(1, '#0e1016');

  ctx.fillStyle = floorGrad;
  ctx.beginPath();
  ctx.moveTo(cx - floorWTop / 2, floorTop);
  ctx.lineTo(cx + floorWTop / 2, floorTop);
  ctx.lineTo(cx + floorWBot / 2, floorBot);
  ctx.lineTo(cx - floorWBot / 2, floorBot);
  ctx.closePath();
  ctx.fill();

  // ropes (3 lines) — front only for depth
  const ropeCols = ['#b0b7ff', '#ffffff', '#ffb0b0'];
  for (let i = 0; i < 3; i++) {
    const y = floorTop + (top - floorTop) * (0.18 - i * 0.02) + i * 8;
    const xw = floorWTop * (1.1 + i * 0.08);
    ctx.strokeStyle = ropeCols[i];
    ctx.lineWidth = Math.max(2, 4 - i);
    ctx.globalAlpha = 0.65 - i * 0.08;
    ctx.beginPath();
    ctx.moveTo(cx - xw / 2, y);
    ctx.lineTo(cx + xw / 2, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // corner posts (front two)
  const postYTop = floorTop - 18;
  const postYBot = floorTop + 64;
  const postXOff = floorWTop / 2 + 10;
  ctx.fillStyle = '#2b2f3f';
  roundRect(ctx, cx - postXOff - 6, postYTop, 12, postYBot - postYTop, 3);
  ctx.fill();
  roundRect(ctx, cx + postXOff - 6, postYTop, 12, postYBot - postYTop, 3);
  ctx.fill();
}

function drawBoxer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  dt: number,
  boxer: Boxer
) {
  const cx = w * 0.5;
  const floorTop = h * 0.32 + h * 0.1;
  const floorH = h * 0.44;
  const z = boxer.side === 'left' ? -1 : 1;

  const baseX = cx + z * (w * 0.18);
  const baseY = floorTop + floorH * 0.42;

  const idleBob = Math.sin(time * 2 + (boxer.idlePhase || 0)) * (h * 0.006);
  const lean = Math.sin(time * 1.3 + (boxer.idlePhase || 0)) * 0.08;

  // Punch animation
  const punch = smoothStep(0, 1, 1 - Math.max(0, Math.min(1, boxer.punchT)));
  const punchReach = w * 0.08 * punch;
  const punchLean = 0.25 * punch;

  // Body
  const bodyW = w * 0.10;
  const bodyH = h * 0.18;
  const bodyX = baseX - bodyW / 2 + z * punchReach * 0.2;
  const bodyY = baseY - bodyH + idleBob;

  ctx.save();
  ctx.translate(baseX, baseY + idleBob);
  ctx.rotate(z * (lean + punchLean));
  ctx.translate(-baseX, -(baseY + idleBob));

  // Legs
  ctx.lineCap = 'round';
  ctx.strokeStyle = `hsla(${boxer.hue}, 28%, 42%, 1)`;
  ctx.lineWidth = Math.max(2, Math.min(8, w * 0.006));
  ctx.beginPath();
  ctx.moveTo(bodyX + bodyW * (boxer.side === 'left' ? 0.3 : 0.7), bodyY + bodyH);
  ctx.lineTo(bodyX + bodyW * (boxer.side === 'left' ? 0.2 : 0.8), bodyY + bodyH + h * 0.06);
  ctx.moveTo(bodyX + bodyW * (boxer.side === 'left' ? 0.7 : 0.3), bodyY + bodyH);
  ctx.lineTo(bodyX + bodyW * (boxer.side === 'left' ? 0.8 : 0.2), bodyY + bodyH + h * 0.06);
  ctx.stroke();

  // Torso
  ctx.fillStyle = `hsla(${boxer.hue}, 45%, 50%, 1)`;
  roundRect(ctx, bodyX, bodyY, bodyW, bodyH, Math.min(10, bodyW * 0.18));
  ctx.fill();

  // Head
  const headR = Math.min(bodyW * 0.38, h * 0.045);
  const headX = bodyX + bodyW * 0.5 + z * headR * 0.1;
  const headY = bodyY - headR * 0.4;
  ctx.fillStyle = `hsla(${boxer.hue}, 20%, 65%, 1)`;
  circle(ctx, headX, headY, headR);

  // Gloves and arms
  const armLen = bodyH * 0.7;
  const guardAngle = -z * (0.8 + 0.2 * Math.sin(time * 2.4 + (boxer.idlePhase || 0)));
  const punchAngle = -z * (0.2 + 1.4 * punch);

  // Rear arm (guard)
  drawArm(ctx, headX, headY + headR * 0.4, armLen * 0.9, guardAngle, boxer.hue, false);
  // Lead arm (punching)
  drawArm(ctx, headX, headY + headR * 0.2, armLen, punchAngle, boxer.hue, true);

  ctx.restore();

  // Shadow
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  const shW = bodyW * 1.4 + punch * w * 0.06;
  const shH = Math.max(4, Math.round(h * 0.012));
  roundRect(ctx, baseX - shW / 2, baseY + h * 0.06, shW, shH, shH / 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawArm(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  ang: number,
  hue: number,
  lead: boolean
) {
  const handR = Math.max(6, Math.min(18, len * 0.16));
  const fore = len * 0.52;
  const upper = len - fore;

  const ux = x + Math.cos(ang) * upper;
  const uy = y + Math.sin(ang) * upper;

  ctx.strokeStyle = `hsla(${hue}, 25%, 42%, 1)`;
  ctx.lineWidth = Math.max(2, Math.min(7, len * 0.06));
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ux, uy);
  ctx.stroke();

  const fx = ux + Math.cos(ang) * fore;
  const fy = uy + Math.sin(ang) * fore;

  ctx.beginPath();
  ctx.moveTo(ux, uy);
  ctx.lineTo(fx, fy);
  ctx.stroke();

  // glove
  ctx.fillStyle = lead ? `hsla(${hue}, 85%, 55%, 1)` : `hsla(${hue}, 70%, 50%, 1)`;
  ctx.shadowBlur = 14;
  ctx.shadowColor = ctx.fillStyle as string;
  circle(ctx, fx, fy, handR);
  ctx.shadowBlur = 0;
}

function drawHUD(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Bottom-center label
  const text = 'Boxing';
  const minDim = Math.min(w, h);
  const fontPx = Math.round(minDim * 0.03);
  ctx.save();
  ctx.font = `700 ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const x = w / 2;
  const y = h - Math.round(minDim * 0.05);
  ctx.lineWidth = Math.max(2, Math.round(fontPx * 0.08));
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
}

function smoothStep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export default registerBoxingScene;