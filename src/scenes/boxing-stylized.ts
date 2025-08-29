// Stylized Boxing scene (2D Canvas) with IK-bent arms/legs and a toy look.
// - Matches the provided reference: red vs blue fighters, tri-color ropes, soft lighting, blue floor.
// - Uses a simple 2-bone IK for elbows and knees, poses blended for smooth motion.
// - Beats/energy modulate punch frequency and vigor.

import type { VisualDirector, SceneDef } from '@controllers/director';

// Helpers: clamp, lerp
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = lerp;
const TAU = Math.PI * 2;

// IK: 2-bone planar chain (shoulder->elbow->wrist) or (hip->knee->ankle)
// Returns joint angles (shoulder/hip absolute angle; elbow/knee bend angle)
function solve2BoneIK(
  sx: number, sy: number,  // shoulder/hip base
  tx: number, ty: number,  // target (fist/foot)
  l1: number, l2: number,  // bone lengths
  elbowSign: number         // +1 or -1 bend direction (out/in)
): { a0: number; a1: number } {
  const dx = tx - sx, dy = ty - sy;
  const d = Math.hypot(dx, dy);
  const dist = clamp(d, 1e-4, l1 + l2 - 1e-4);
  // Law of cosines
  const cosA1 = clamp((l1*l1 + l2*l2 - dist*dist) / (2*l1*l2), -1, 1);
  let a1 = Math.acos(cosA1) * elbowSign; // elbow/knee angle (bend)
  const cosA0 = clamp((l1*l1 + dist*dist - l2*l2) / (2*l1*dist), -1, 1);
  const base = Math.atan2(dy, dx);
  let a0 = base + elbowSign * Math.acos(cosA0); // shoulder/hip absolute angle
  return { a0, a1 };
}

// Fighter model (2D parametric)
type FighterSide = 'left' | 'right';
interface Fighter {
  side: FighterSide; // 'left' (blue) is on right half looking left; 'right' (red) is on left half looking right
  // Base pose anchor
  rootX: number;
  rootY: number;
  faceRight: boolean;
  // Proportions (relative to height H)
  H: number;
  torso: number;
  upperArm: number;
  foreArm: number;
  thigh: number;
  shin: number;
  // Motion state
  guard: number;      // 0..1 guard lift
  lean: number;       // -1 (back) .. +1 (forward)
  bounce: number;     // 0..1 stance bounce
  punchL: number;     // 0..1 left hand punch progress
  punchR: number;     // 0..1 right hand punch progress
  blockL: number;     // 0..1
  blockR: number;     // 0..1
  slip: number;       // -1..1 slip left/right
  colorMain: string;
  colorTrim: string;
  glove: string;
  boot: string;
  sign: number;       // 1 facing right, -1 facing left (in local drawing coordinates)
}

function makeFighter(side: FighterSide, x: number, y: number, H: number, palette: 'red' | 'blue'): Fighter {
  const colorMain = palette === 'red' ? '#D8312A' : '#2564FF';
  const colorTrim = '#E7E7E7';
  const glove = palette === 'red' ? '#ED4038' : '#2E6DFF';
  const boot = glove;

  const faceRight = side === 'right';
  return {
    side,
    rootX: x, rootY: y,
    faceRight,
    H,
    torso: 0.34*H,
    upperArm: 0.18*H,
    foreArm: 0.18*H,
    thigh: 0.22*H,
    shin: 0.22*H,
    guard: 0.9,
    lean: 0.15 * (faceRight ? 1 : 1), // slight forward lean for both in reference
    bounce: 0,
    punchL: 0, punchR: 0,
    blockL: 0, blockR: 0,
    slip: 0,
    colorMain, colorTrim, glove, boot,
    sign: faceRight ? 1 : -1
  };
}

type PunchType = 'jab' | 'cross' | 'hook' | 'body';
interface SceneState {
  t: number;
  // Fighters
  red: Fighter;   // left person (red gear)
  blue: Fighter;  // right person (blue gear)
  // Ring dims
  ring: { x: number; y: number; w: number; h: number };
  // Scheduling
  nextActionAt: number;
  lastBeatAt: number;
  rng: () => number;
}

function makeRng(seed = 1337) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed & 0xffffffff) / 0x100000000;
  };
}

// Visual helpers
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, Math.abs(w)/2, Math.abs(h)/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}

function drawRing(ctx: CanvasRenderingContext2D, R: SceneState['ring']) {
  const postR = Math.min(R.w, R.h) * 0.025;
  const ropeGap = R.h * 0.14;
  const ropeH = R.h * 0.03;
  const baseY = R.y + R.h * 0.22; // floor raised (as in image)

  // Floor
  ctx.fillStyle = '#2A59C9';
  roundRect(ctx, R.x, baseY, R.w, R.h - (baseY - R.y), Math.min(20, R.w*0.02));
  ctx.fill();

  // Posts
  const posts = [
    { x: R.x + postR*1.4, y: baseY - ropeGap*1.6 },
    { x: R.x + R.w - postR*1.4, y: baseY - ropeGap*1.6 }
  ];
  ctx.fillStyle = '#5C6670';
  posts.forEach(p => {
    roundRect(ctx, p.x - postR, p.y - postR*4, postR*2, ropeGap*3.6 + postR*6, postR);
    ctx.fill();
  });

  // Ropes: top red, middle white, bottom blue (match reference)
  const ropeColors = ['#E83A34', '#EDEDED', '#295BDA'];
  for (let i = 0; i < 3; i++) {
    const y = baseY - ropeGap * (2 - i);
    ctx.fillStyle = ropeColors[i];
    const rh = ropeH;
    roundRect(ctx, R.x + postR*1.9, y - rh/2, R.w - postR*3.8, rh, rh/2);
    ctx.fill();
  }

  // Back wall vignette
  const g = ctx.createRadialGradient(R.x + R.w*0.5, baseY - ropeGap*1.5, 0, R.x + R.w*0.5, baseY - ropeGap*1.5, R.w*0.8);
  g.addColorStop(0, 'rgba(18, 27, 47, 0.3)');
  g.addColorStop(1, '#121B2F');
  ctx.fillStyle = g;
  ctx.fillRect(R.x, R.y, R.w, baseY - R.y);
}

// Draw a capsule (rounded rectangle)
function drawCapsule(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, r: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    ctx.beginPath();
    ctx.arc(x1, y1, r, 0, TAU);
    return;
  }
  
  const ux = dx / len;
  const uy = dy / len;
  const vx = -uy;
  const vy = ux;
  
  ctx.beginPath();
  ctx.arc(x1, y1, r, 0, TAU);
  ctx.arc(x2, y2, r, 0, TAU);
  
  // Connect with rectangle
  const px1 = x1 + vx * r;
  const py1 = y1 + vy * r;
  const px2 = x1 - vx * r;
  const py2 = y1 - vy * r;
  const px3 = x2 - vx * r;
  const py3 = y2 - vy * r;
  const px4 = x2 + vx * r;
  const py4 = y2 + vy * r;
  
  ctx.moveTo(px1, py1);
  ctx.lineTo(px4, py4);
  ctx.lineTo(px3, py3);
  ctx.lineTo(px2, py2);
  ctx.closePath();
}

function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter) {
  const { rootX, rootY, H, torso, upperArm, foreArm, thigh, shin, sign } = f;
  const { guard, lean, bounce, punchL, punchR, blockL, blockR, slip } = f;
  
  // Base positioning with lean and slip
  const baseY = rootY + bounce * H * 0.05;
  const headY = baseY - H * 0.95;
  const shoulderY = headY + H * 0.15;
  const torsoBot = shoulderY + torso;
  const hipY = torsoBot;
  
  const centerX = rootX + lean * H * 0.08 + slip * H * 0.12;
  
  // Head
  const headR = H * 0.08;
  ctx.fillStyle = f.colorTrim;
  ctx.beginPath();
  ctx.arc(centerX, headY, headR, 0, TAU);
  ctx.fill();
  
  // Torso
  const torsoW = H * 0.16;
  ctx.fillStyle = f.colorMain;
  roundRect(ctx, centerX - torsoW/2, shoulderY, torsoW, torso, torsoW * 0.3);
  ctx.fill();
  
  // Belt
  ctx.fillStyle = f.colorTrim;
  const beltH = H * 0.03;
  roundRect(ctx, centerX - torsoW/2, torsoBot - beltH, torsoW, beltH, beltH/2);
  ctx.fill();
  
  // Arms with IK
  drawArm(ctx, f, 'left', centerX - torsoW * 0.3, shoulderY + torso * 0.2);
  drawArm(ctx, f, 'right', centerX + torsoW * 0.3, shoulderY + torso * 0.2);
  
  // Legs with IK  
  drawLeg(ctx, f, 'left', centerX - torsoW * 0.2, hipY);
  drawLeg(ctx, f, 'right', centerX + torsoW * 0.2, hipY);
}

function drawArm(ctx: CanvasRenderingContext2D, f: Fighter, arm: 'left' | 'right', sx: number, sy: number) {
  const { upperArm, foreArm, guard, punchL, punchR, blockL, blockR, sign, H } = f;
  
  // Determine target position based on action
  const isPunch = arm === 'left' ? punchL > 0 : punchR > 0;
  const isBlock = arm === 'left' ? blockL > 0 : blockR > 0;
  const punchAmt = arm === 'left' ? punchL : punchR;
  const blockAmt = arm === 'left' ? blockL : blockR;
  
  // Base guard position
  let tx = sx + sign * upperArm * 0.6;
  let ty = sy + upperArm * 0.3;
  
  // Apply actions
  if (isPunch) {
    tx += sign * upperArm * 1.8 * punchAmt;
    ty -= upperArm * 0.2 * punchAmt;
  }
  if (isBlock) {
    tx = sx + sign * upperArm * 0.2;
    ty = sy - upperArm * 0.5 * blockAmt;
  }
  
  // Apply guard position
  ty -= upperArm * 0.4 * guard;
  
  // IK solve
  const elbowSign = arm === 'left' ? -sign : sign; // elbows bend outward
  const ik = solve2BoneIK(sx, sy, tx, ty, upperArm, foreArm, elbowSign);
  
  // Draw upper arm
  const elbowX = sx + Math.cos(ik.a0) * upperArm;
  const elbowY = sy + Math.sin(ik.a0) * upperArm;
  
  ctx.fillStyle = f.colorMain;
  const armR = H * 0.025;
  drawCapsule(ctx, sx, sy, elbowX, elbowY, armR);
  ctx.fill();
  
  // Draw forearm
  const wristX = elbowX + Math.cos(ik.a0 + ik.a1) * foreArm;
  const wristY = elbowY + Math.sin(ik.a0 + ik.a1) * foreArm;
  
  drawCapsule(ctx, elbowX, elbowY, wristX, wristY, armR);
  ctx.fill();
  
  // Glove
  ctx.fillStyle = f.glove;
  const gloveR = H * 0.05;
  ctx.beginPath();
  ctx.arc(wristX, wristY, gloveR, 0, TAU);
  ctx.fill();
}

function drawLeg(ctx: CanvasRenderingContext2D, f: Fighter, leg: 'left' | 'right', hx: number, hy: number) {
  const { thigh, shin, bounce, H } = f;
  
  // Foot position with stance bounce
  const footX = hx + (leg === 'left' ? -1 : 1) * H * 0.08;
  const footY = f.rootY + H * 0.05 + bounce * H * 0.05;
  
  // IK solve (knees bend forward)
  const kneeSign = 1;
  const ik = solve2BoneIK(hx, hy, footX, footY, thigh, shin, kneeSign);
  
  // Draw thigh
  const kneeX = hx + Math.cos(ik.a0) * thigh;
  const kneeY = hy + Math.sin(ik.a0) * thigh;
  
  ctx.fillStyle = f.colorMain;
  const legR = H * 0.03;
  drawCapsule(ctx, hx, hy, kneeX, kneeY, legR);
  ctx.fill();
  
  // Draw shin
  const ankleX = kneeX + Math.cos(ik.a0 + ik.a1) * shin;
  const ankleY = kneeY + Math.sin(ik.a0 + ik.a1) * shin;
  
  drawCapsule(ctx, kneeX, kneeY, ankleX, ankleY, legR);
  ctx.fill();
  
  // Boot
  ctx.fillStyle = f.boot;
  const bootW = H * 0.08;
  const bootH = H * 0.04;
  roundRect(ctx, ankleX - bootW/2, ankleY - bootH/2, bootW, bootH, bootH/2);
  ctx.fill();
}

// Animation system
function updateFighter(f: Fighter, dt: number, energy: number, rng: () => number) {
  // Bounce
  f.bounce = 0.5 + 0.5 * Math.sin(Date.now() * 0.003);
  
  // Decay actions
  f.punchL = Math.max(0, f.punchL - dt * 4);
  f.punchR = Math.max(0, f.punchR - dt * 4);
  f.blockL = Math.max(0, f.blockL - dt * 3);
  f.blockR = Math.max(0, f.blockR - dt * 3);
  
  // Random actions based on energy
  if (rng() < energy * 0.005) {
    if (rng() < 0.6) {
      if (rng() < 0.5) f.punchL = 1;
      else f.punchR = 1;
    } else {
      if (rng() < 0.5) f.blockL = 1;
      else f.blockR = 1;
    }
  }
  
  // Slip back to center
  f.slip = mix(f.slip, 0, dt * 2);
  f.lean = mix(f.lean, 0.15 * (f.faceRight ? 1 : 1), dt * 1);
}

// Scene creation
function makeBoxingStylized(): SceneDef {
  let state: SceneState | null = null;
  
  function initState(w: number, h: number): SceneState {
    const ringW = Math.min(w * 0.8, h * 1.2);
    const ringH = ringW * 0.6;
    const ringX = (w - ringW) / 2;
    const ringY = (h - ringH) / 2 + h * 0.1;
    
    const fighterH = ringH * 0.4;
    const redX = ringX + ringW * 0.25;
    const blueX = ringX + ringW * 0.75;
    const fighterY = ringY + ringH * 0.9;
    
    return {
      t: 0,
      red: makeFighter('right', redX, fighterY, fighterH, 'red'),
      blue: makeFighter('left', blueX, fighterY, fighterH, 'blue'),
      ring: { x: ringX, y: ringY, w: ringW, h: ringH },
      nextActionAt: 0,
      lastBeatAt: 0,
      rng: makeRng()
    };
  }
  
  return {
    name: 'Boxing (Stylized)',
    
    draw(ctx, w, h, time, dt, director) {
      if (!state) state = initState(w, h);
      
      state.t += dt;
      const energy = director['features']?.energy ?? 0.5;
      
      // Background gradient
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#121B2F');
      bg.addColorStop(1, '#0A0E1A');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      
      // Draw ring
      drawRing(ctx, state.ring);
      
      // Update and draw fighters
      updateFighter(state.red, dt, energy, state.rng);
      updateFighter(state.blue, dt, energy, state.rng);
      
      drawFighter(ctx, state.red);
      drawFighter(ctx, state.blue);
    },
    
    onDownbeat(director) {
      if (!state) return;
      
      const energy = director['features']?.energy ?? 0.5;
      
      // Bias fighters to punch on downbeat
      if (state.rng() < 0.4 + energy * 0.4) {
        const fighter = state.rng() < 0.5 ? state.red : state.blue;
        if (state.rng() < 0.5) {
          fighter.punchL = 1;
        } else {
          fighter.punchR = 1;
        }
      }
      
      // Occasional slip
      if (state.rng() < 0.2) {
        const fighter = state.rng() < 0.5 ? state.red : state.blue;
        fighter.slip = (state.rng() - 0.5) * 0.4;
      }
    }
  };
}

// Register the scene when director is available
function attachWhenReady() {
  const attempt = () => {
    const d = (window as any).__director as VisualDirector | undefined;
    if (!d) return false;
    try {
      d.registerScene(makeBoxingStylized());
      return true;
    } catch (e) {
      console.warn('Failed to register Boxing (Stylized) scene', e);
      return false;
    }
  };

  if (!attempt()) {
    const timer = setInterval(() => { if (attempt()) clearInterval(timer); }, 300);
    window.addEventListener('load', () => { if (attempt()) clearInterval(timer); });
  }
}

attachWhenReady();