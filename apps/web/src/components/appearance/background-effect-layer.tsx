import { useEffect, useMemo, useRef } from 'react';
import { useAppearance } from '@/lib/appearance/appearance-context';
import { parseCss, toRgb } from '@/lib/appearance/color';
import { startEffect } from '@/lib/appearance/effects';
import { buildPalette } from '@/lib/appearance/themes';

/**
 * The app's single decorative background layer (rendered once, by
 * AppearanceProvider — never by pages). Fixed behind all content, invisible
 * to assistive technology, never receives pointer events, and takes no space
 * in the layout. Changing the effect stops the previous one completely.
 */
export function BackgroundEffectLayer() {
  const { current, reducedMotion } = useAppearance();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { backgroundEffect: effect, animationIntensity: intensity, mode } = current;
  const accent = useMemo(
    () => toRgb(parseCss(buildPalette(current)['--primary']!)).join(','),
    [current],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || effect === 'none') return;
    const [r, g, b] = accent.split(',').map(Number) as [number, number, number];
    return startEffect(canvas, { effect, intensity, mode, accent: [r, g, b], reducedMotion });
  }, [effect, intensity, mode, accent, reducedMotion]);

  if (effect === 'none') return null;
  return (
    <canvas
      ref={canvasRef}
      data-effect={effect}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 size-full"
    />
  );
}
