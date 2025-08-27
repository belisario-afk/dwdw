import { VisualDirector, type SceneDef } from '../controllers/director';

// Example external scene: "Starfield"
// - Uses director palette and energy to modulate motion
// - Demonstrates onBeat burst
function makeStarfield(): SceneDef {
  const stars: Array<{ x: number; y: number; z: number; vx: number; vy: number }> = [];
  let inited = false;
  const ensure = (w: number, h: number, count: number) => {
    while (stars.length < count) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        z: Math.random() * 1 + 0.2,
        vx: 0,
        vy: 0
      });
    }
    if (stars.length > count) stars.length = count;
    inited = true;
  };

  return {
    name: 'Starfield',
    draw(ctx, w, h, time, dt, director) {
      if (!inited) ensure(w, h, Math.max(200, Math.floor((w * h) / 12000)));
      const energy = director['features']?.energy ?? 0.5;
      const valence = director['features']?.valence ?? 0.5;

      // Background gradient using palette
      const g = ctx.createLinearGradient(0, 0, w, h);
      const col0 = director['palette'].colors[0] || director['palette'].dominant;
      const col1 = director['palette'].colors[1] || director['palette'].secondary;
      g.addColorStop(0, col0);
      g.addColorStop(1, col1);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Dim to add depth
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, 0, w, h);

      // Center pull
      const cx = w / 2, cy = h / 2;
      const pull = 8 + energy * 42;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,255,255,${0.8})`;

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const dx = cx - s.x;
        const dy = cy - s.y;
        const len = Math.hypot(dx, dy) + 1e-6;
        const dirx = dx / len;
        const diry = dy / len;

        // Accelerate towards center; z = parallax factor
        const accel = pull * (0.5 + s.z);
        s.vx += dirx * accel * dt;
        s.vy += diry * accel * dt;

        // Integrate
        const px = s.x;
        const py = s.y;
        s.x += s.vx * dt;
        s.y += s.vy * dt;

        // Wrap around edges
        if (s.x < -10 || s.x > w + 10 || s.y < -10 || s.y > h + 10) {
          s.x = Math.random() * w;
          s.y = Math.random() * h;
          s.vx = s.vy = 0;
          s.z = Math.random() * 1 + 0.2;
          continue;
        }

        // Trail
        const lw = Math.max(0.6, 1.6 * s.z);
        ctx.strokeStyle = `rgba(255,255,255,${0.35 + valence * 0.4})`;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }

      ctx.restore();
    },
    onBeat(director) {
      // Small outward pulse by nudging velocities away from center
      const W = director.getCanvas().width;
      const H = director.getCanvas().height;
      const cx = W / 2, cy = H / 2;
      const energy = director['features']?.energy ?? 0.5;
      const boost = 60 + energy * 120;
      // Randomly push ~10% of stars
      let count = 0;
      for (let i = 0; i < (stars.length / 10) | 0; i++) {
        const si = (Math.random() * stars.length) | 0;
        const s = stars[si];
        const dx = s.x - cx;
        const dy = s.y - cy;
        const len = Math.hypot(dx, dy) + 1e-6;
        s.vx += (dx / len) * boost;
        s.vy += (dy / len) * boost;
        if (++count > 40) break;
      }
    },
    onDownbeat() {
      // Slight parallax increase
      for (let i = 0; i < stars.length; i++) {
        stars[i].z = Math.min(2.0, stars[i].z + 0.15);
      }
    }
  };
}

// Register scenes once the director is available on window
function attachWhenReady() {
  const attempt = () => {
    const d = (window as any).__director as VisualDirector | undefined;
    if (!d) return false;
    try {
      d.registerScene(makeStarfield());
      // Optionally request it once for a quick visual test:
      // d.requestScene('Starfield');
      return true;
    } catch (e) {
      console.warn('Failed to register custom scenes', e);
      return false;
    }
  };

  if (!attempt()) {
    const timer = setInterval(() => { if (attempt()) clearInterval(timer); }, 300);
    window.addEventListener('load', () => { if (attempt()) clearInterval(timer); });
  }
}

attachWhenReady();