import type { AnimationIntensity, AppearanceMode, BackgroundEffect } from '@app/shared';
import type { Rgb } from './color';

/**
 * Decorative background effects, drawn on ONE <canvas> behind the app
 * (BackgroundEffectLayer). One requestAnimationFrame loop, capped at
 * 30 fps, paused while the tab is hidden; a fixed, small number of particles
 * (no DOM nodes); a single still frame when the user prefers reduced motion.
 * Everything is kept faint: this is a business application.
 */

export interface EffectOptions {
  effect: Exclude<BackgroundEffect, 'none'>;
  intensity: AnimationIntensity;
  mode: AppearanceMode;
  /** The theme's accent, for effects that use it (soft lights, aurora). */
  accent: Rgb;
  reducedMotion: boolean;
}

interface Scene {
  /** Advances by `dt` seconds. */
  step(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

/** Particle count and speed per intensity. HIGH stays calm enough to work with. */
const INTENSITY = {
  low: { amount: 0.5, speed: 0.6 },
  medium: { amount: 1, speed: 1 },
  high: { amount: 1.6, speed: 1.3 },
} as const satisfies Record<AnimationIntensity, { amount: number; speed: number }>;

const FRAME_SECONDS = 1 / 30;

const rgba = ([r, g, b]: Rgb, alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`;
const random = (min: number, max: number) => min + Math.random() * (max - min);

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  spin: number;
  angle: number;
  color: string;
}

/** Shared falling/drifting particle field. */
function field(
  width: number,
  height: number,
  count: number,
  make: (p: Partial<Particle>) => Particle,
): Particle[] {
  return Array.from({ length: count }, () => make({ x: random(0, width), y: random(0, height) }));
}

function wrap(p: Particle, width: number, height: number, margin = 20) {
  if (p.y > height + margin) p.y = -margin;
  if (p.y < -margin) p.y = height + margin;
  if (p.x > width + margin) p.x = -margin;
  if (p.x < -margin) p.x = width + margin;
}

function createScene(options: EffectOptions, width: number, height: number): Scene {
  const { amount, speed } = INTENSITY[options.intensity];
  const dark = options.mode === 'dark';
  // Per-megapixel density keeps large screens from getting crowded.
  const scale = Math.min(1.5, (width * height) / 1_000_000 + 0.4);
  const count = (base: number) => Math.max(4, Math.round(base * amount * scale));
  const ink: Rgb = dark ? [226, 232, 240] : [71, 85, 105];
  const t = { now: 0 };

  switch (options.effect) {
    case 'rain': {
      const drops = field(width, height, count(70), (p) => ({
        x: p.x!,
        y: p.y!,
        vx: -40,
        vy: random(500, 800),
        size: random(10, 22),
        phase: 0,
        spin: 0,
        angle: 0,
        color: rgba(ink, dark ? random(0.12, 0.25) : random(0.08, 0.16)),
      }));
      return {
        step(dt) {
          for (const d of drops) {
            d.x += d.vx * dt * speed;
            d.y += d.vy * dt * speed;
            wrap(d, width, height, 30);
          }
        },
        draw(ctx) {
          ctx.lineWidth = 1;
          for (const d of drops) {
            ctx.strokeStyle = d.color;
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x + (d.vx / d.vy) * d.size, d.y + d.size);
            ctx.stroke();
          }
        },
      };
    }
    case 'snow':
    case 'cherry-blossoms':
    case 'autumn-leaves': {
      const palette: Record<typeof options.effect, Rgb[]> = {
        snow: dark ? [[241, 245, 249]] : [[148, 163, 184]],
        'cherry-blossoms': [
          [244, 172, 196],
          [251, 207, 220],
          [236, 140, 172],
        ],
        'autumn-leaves': [
          [217, 119, 6],
          [194, 65, 12],
          [180, 83, 9],
          [202, 138, 4],
        ],
      };
      const colors = palette[options.effect];
      const base = options.effect === 'snow' ? 60 : options.effect === 'cherry-blossoms' ? 24 : 18;
      const alpha = options.effect === 'snow' ? (dark ? 0.55 : 0.45) : dark ? 0.45 : 0.35;
      const flakes = field(width, height, count(base), (p) => ({
        x: p.x!,
        y: p.y!,
        vx: random(-15, 15),
        vy: options.effect === 'snow' ? random(20, 45) : random(25, 50),
        size: options.effect === 'snow' ? random(1.2, 3) : random(4, 7),
        phase: random(0, Math.PI * 2),
        spin: random(-1.2, 1.2),
        angle: random(0, Math.PI * 2),
        color: rgba(colors[Math.floor(random(0, colors.length))]!, alpha),
      }));
      return {
        step(dt) {
          t.now += dt;
          for (const f of flakes) {
            f.x += (f.vx + Math.sin(t.now * 0.8 + f.phase) * 18) * dt * speed;
            f.y += f.vy * dt * speed;
            f.angle += f.spin * dt * speed;
            wrap(f, width, height);
          }
        },
        draw(ctx) {
          for (const f of flakes) {
            ctx.fillStyle = f.color;
            ctx.beginPath();
            if (options.effect === 'snow') {
              ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
            } else {
              // A petal/leaf: a rotated ellipse.
              ctx.ellipse(f.x, f.y, f.size, f.size * 0.55, f.angle, 0, Math.PI * 2);
            }
            ctx.fill();
          }
        },
      };
    }
    case 'fireflies': {
      const glow: Rgb = dark ? [253, 224, 71] : [217, 119, 6];
      const flies = field(width, height, count(25), (p) => ({
        x: p.x!,
        y: p.y!,
        vx: random(-12, 12),
        vy: random(-12, 12),
        size: random(1.5, 2.8),
        phase: random(0, Math.PI * 2),
        spin: random(0.6, 1.4),
        angle: 0,
        color: '',
      }));
      return {
        step(dt) {
          t.now += dt;
          for (const f of flies) {
            f.vx += random(-6, 6) * dt;
            f.vy += random(-6, 6) * dt;
            f.vx = Math.max(-15, Math.min(15, f.vx));
            f.vy = Math.max(-15, Math.min(15, f.vy));
            f.x += f.vx * dt * speed;
            f.y += f.vy * dt * speed;
            wrap(f, width, height);
          }
        },
        draw(ctx) {
          for (const f of flies) {
            const pulse = 0.5 + 0.5 * Math.sin(t.now * f.spin * 2 + f.phase);
            const radius = f.size * 5;
            const gradient = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, radius);
            gradient.addColorStop(0, rgba(glow, (dark ? 0.6 : 0.35) * pulse));
            gradient.addColorStop(1, rgba(glow, 0));
            ctx.fillStyle = gradient;
            ctx.fillRect(f.x - radius, f.y - radius, radius * 2, radius * 2);
          }
        },
      };
    }
    case 'starry-night': {
      const stars = field(width, height, count(110), (p) => ({
        x: p.x!,
        y: p.y!,
        vx: 0,
        vy: 0,
        size: random(0.5, 1.6),
        phase: random(0, Math.PI * 2),
        spin: random(0.4, 1.5),
        angle: 0,
        color: '',
      }));
      const shooting = { x: -1, y: 0, life: 0 };
      return {
        step(dt) {
          t.now += dt * speed;
          shooting.life -= dt;
          if (shooting.life <= -6 / speed && Math.random() < 0.004 * speed) {
            Object.assign(shooting, { x: random(0, width), y: random(0, height * 0.4), life: 0.9 });
          }
          shooting.x += 600 * dt;
          shooting.y += 250 * dt;
        },
        draw(ctx) {
          for (const s of stars) {
            const twinkle = 0.55 + 0.45 * Math.sin(t.now * s.spin + s.phase);
            ctx.fillStyle = rgba(ink, (dark ? 0.75 : 0.35) * twinkle);
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
          }
          if (shooting.life > 0) {
            ctx.strokeStyle = rgba(ink, (dark ? 0.5 : 0.25) * shooting.life);
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(shooting.x, shooting.y);
            ctx.lineTo(shooting.x - 90, shooting.y - 37);
            ctx.stroke();
          }
        },
      };
    }
    case 'soft-lights': {
      const colors: Rgb[] = [options.accent, [56, 189, 248], [244, 114, 182], [52, 211, 153]];
      const lights = field(width, height, Math.round(5 * amount) + 1, (p) => ({
        x: p.x!,
        y: p.y!,
        vx: random(-14, 14),
        vy: random(-10, 10),
        size: random(0.18, 0.32) * Math.max(width, height),
        phase: 0,
        spin: 0,
        angle: 0,
        color: '',
      })).map((light, index) => ({ ...light, rgb: colors[index % colors.length]! }));
      return {
        step(dt) {
          for (const l of lights) {
            l.x += l.vx * dt * speed;
            l.y += l.vy * dt * speed;
            if (l.x < -l.size * 0.3 || l.x > width + l.size * 0.3) l.vx *= -1;
            if (l.y < -l.size * 0.3 || l.y > height + l.size * 0.3) l.vy *= -1;
          }
        },
        draw(ctx) {
          for (const l of lights) {
            const gradient = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.size);
            gradient.addColorStop(0, rgba(l.rgb, dark ? 0.14 : 0.1));
            gradient.addColorStop(1, rgba(l.rgb, 0));
            ctx.fillStyle = gradient;
            ctx.fillRect(l.x - l.size, l.y - l.size, l.size * 2, l.size * 2);
          }
        },
      };
    }
    case 'aurora': {
      const bands: Rgb[] = [options.accent, [45, 212, 191], [167, 139, 250]];
      return {
        step(dt) {
          t.now += dt * speed * 0.35;
        },
        draw(ctx) {
          for (const [index, rgb] of bands.entries()) {
            const baseY = height * (0.18 + index * 0.1);
            const gradient = ctx.createLinearGradient(0, baseY - 120, 0, baseY + 160);
            gradient.addColorStop(0, rgba(rgb, 0));
            gradient.addColorStop(0.5, rgba(rgb, dark ? 0.16 : 0.09));
            gradient.addColorStop(1, rgba(rgb, 0));
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(0, height);
            for (let x = 0; x <= width; x += 40) {
              const y =
                baseY +
                Math.sin(x / 260 + t.now + index * 1.7) * 50 +
                Math.sin(x / 120 - t.now * 1.3 + index) * 18;
              ctx.lineTo(x, y);
            }
            ctx.lineTo(width, height * 0.75);
            ctx.lineTo(0, height * 0.75);
            ctx.closePath();
            ctx.fill();
          }
        },
      };
    }
  }
}

/**
 * Runs an effect on `canvas` until the returned function is called. Calling
 * it removes every listener and stops the animation loop, so effects never
 * stack or leak when the setting changes or the layer unmounts.
 */
export function startEffect(canvas: HTMLCanvasElement, options: EffectOptions): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  let scene: Scene;
  let frame = 0;
  let last = 0;
  let accumulated = 0;
  let stopped = false;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    scene = createScene(options, width, height);
    render(0);
  };

  const render = (dt: number) => {
    scene.step(dt);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    scene.draw(ctx);
  };

  const tick = (time: number) => {
    if (stopped) return;
    frame = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.1, (time - last) / 1000) : 0;
    last = time;
    accumulated += dt;
    if (accumulated < FRAME_SECONDS) return;
    render(accumulated);
    accumulated = 0;
  };

  const play = () => {
    if (options.reducedMotion || stopped || document.hidden || frame) return;
    last = 0;
    frame = requestAnimationFrame(tick);
  };
  const pause = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const onVisibility = () => (document.hidden ? pause() : play());

  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  };

  resize();
  play();
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    stopped = true;
    pause();
    clearTimeout(resizeTimer);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
