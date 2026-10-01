import { BACKGROUND_EFFECTS } from '@app/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type EffectOptions, startEffect } from './effects';

/** A 2D context that records nothing and supports every drawing call. */
function fakeContext() {
  const gradient = { addColorStop: () => {} };
  const calls = { draw: 0 };
  const ctx = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === 'createRadialGradient' || property === 'createLinearGradient') {
          return () => gradient;
        }
        if (property === 'clearRect') return () => (calls.draw += 1);
        return () => {};
      },
      set: () => true,
    },
  );
  return { ctx, calls };
}

function canvasWith(ctx: object) {
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => ctx) as unknown as typeof canvas.getContext;
  return canvas;
}

const options = (effect: EffectOptions['effect'], reducedMotion = false): EffectOptions => ({
  effect,
  intensity: 'medium' as const,
  mode: 'light' as const,
  accent: [79, 70, 229] as [number, number, number],
  reducedMotion,
});

describe('startEffect', () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;

  beforeEach(() => {
    frames = new Map();
    nextFrame = 1;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(nextFrame, callback);
      return nextFrame++;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const runFrames = (count: number) => {
    let time = 0;
    for (let index = 0; index < count; index += 1) {
      const pendingFrames = [...frames.entries()];
      frames.clear();
      time += 40;
      for (const [, callback] of pendingFrames) callback(time);
    }
  };

  it.each(
    BACKGROUND_EFFECTS.filter((effect): effect is EffectOptions['effect'] => effect !== 'none'),
  )('animates %s and stops completely', (effect) => {
    const { ctx, calls } = fakeContext();
    const stop = startEffect(canvasWith(ctx), options(effect));

    expect(frames.size).toBe(1);
    runFrames(5);
    expect(calls.draw).toBeGreaterThan(2);

    stop();
    expect(frames.size).toBe(0);
    const drawn = calls.draw;
    runFrames(3);
    expect(calls.draw).toBe(drawn);
  });

  it('draws one still frame and never animates under reduced motion', () => {
    const { ctx, calls } = fakeContext();
    const stop = startEffect(canvasWith(ctx), options('snow', true));

    expect(calls.draw).toBe(1);
    expect(frames.size).toBe(0);
    stop();
  });

  it('pauses while the tab is hidden and resumes when visible', () => {
    const { ctx } = fakeContext();
    const stop = startEffect(canvasWith(ctx), options('rain'));
    const hidden = vi.spyOn(document, 'hidden', 'get');

    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(0);

    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(1);

    stop();
    hidden.mockRestore();
  });

  it('removes its listeners when stopped', () => {
    const { ctx } = fakeContext();
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    const removeDocument = vi.spyOn(document, 'removeEventListener');

    startEffect(canvasWith(ctx), options('fireflies'))();

    expect(removeWindow).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('does nothing without a 2D context', () => {
    const stop = startEffect(canvasWith(null as unknown as object), options('aurora'));
    expect(frames.size).toBe(0);
    expect(stop).not.toThrow();
  });
});
