import { BACKGROUND_EFFECTS, type BackgroundEffect } from '@app/shared';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { radioOptionProps } from '@/components/ui/use-radio-group';
import { EFFECTS } from '@/lib/appearance/labels';
import { cn } from '@/lib/cn';

/** Deterministic pseudo-random positions so previews look the same on every render. */
const points = (count: number, seed: number) =>
  Array.from({ length: count }, (_, index) => {
    const x = ((index * 37 + seed * 11) % 100) + 0.5;
    const y = ((index * 61 + seed * 23) % 100) + 0.5;
    return { x, y, i: index };
  });

/** A still, miniature impression of each effect (the real one runs on a canvas). */
function Preview({ effect }: { effect: BackgroundEffect }): ReactNode {
  switch (effect) {
    case 'none':
      return null;
    case 'rain':
      return points(18, 1).map(({ x, y, i }) => (
        <line
          key={i}
          x1={x}
          y1={y}
          x2={x - 2}
          y2={y + 9}
          stroke="currentColor"
          strokeOpacity="0.35"
        />
      ));
    case 'snow':
      return points(22, 2).map(({ x, y, i }) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={0.8 + (i % 3) * 0.5}
          fill="currentColor"
          fillOpacity="0.45"
        />
      ));
    case 'fireflies':
      return points(9, 3).map(({ x, y, i }) => (
        <circle key={i} cx={x} cy={y} r="2.4" fill="rgb(234 179 8)" fillOpacity="0.55" />
      ));
    case 'starry-night':
      return points(30, 4).map(({ x, y, i }) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={0.4 + (i % 4) * 0.25}
          fill="currentColor"
          fillOpacity="0.6"
        />
      ));
    case 'autumn-leaves':
      return points(9, 5).map(({ x, y, i }) => (
        <ellipse
          key={i}
          cx={x}
          cy={y}
          rx="3"
          ry="1.6"
          transform={`rotate(${i * 40} ${x} ${y})`}
          fill={['rgb(217 119 6)', 'rgb(194 65 12)', 'rgb(202 138 4)'][i % 3]}
          fillOpacity="0.6"
        />
      ));
    case 'cherry-blossoms':
      return points(11, 6).map(({ x, y, i }) => (
        <ellipse
          key={i}
          cx={x}
          cy={y}
          rx="2.6"
          ry="1.5"
          transform={`rotate(${i * 33} ${x} ${y})`}
          fill={['rgb(244 172 196)', 'rgb(236 140 172)'][i % 2]}
          fillOpacity="0.7"
        />
      ));
    case 'soft-lights':
      return (
        <>
          <defs>
            <radialGradient id="effect-preview-lights-a">
              <stop offset="0" stopColor="var(--primary)" stopOpacity="0.35" />
              <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="effect-preview-lights-b">
              <stop offset="0" stopColor="rgb(56 189 248)" stopOpacity="0.3" />
              <stop offset="1" stopColor="rgb(56 189 248)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="25" cy="35" r="30" fill="url(#effect-preview-lights-a)" />
          <circle cx="75" cy="65" r="34" fill="url(#effect-preview-lights-b)" />
        </>
      );
    case 'aurora':
      return (
        <>
          <defs>
            <linearGradient id="effect-preview-aurora-a" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="rgb(45 212 191)" stopOpacity="0.45" />
              <stop offset="1" stopColor="rgb(45 212 191)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="effect-preview-aurora-b" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--primary)" stopOpacity="0.35" />
              <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 45 Q 25 25 50 40 T 100 35 V 70 H 0 Z" fill="url(#effect-preview-aurora-a)" />
          <path d="M0 55 Q 30 40 60 55 T 100 50 V 80 H 0 Z" fill="url(#effect-preview-aurora-b)" />
        </>
      );
  }
}

/** Background effect cards with a still preview, as an accessible radio group. */
export function EffectPicker({
  value,
  onChange,
}: {
  value: BackgroundEffect;
  onChange: (effect: BackgroundEffect) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Background effect"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
    >
      {EFFECTS.map((effect) => {
        const checked = value === effect.id;
        return (
          <button
            key={effect.id}
            {...radioOptionProps(BACKGROUND_EFFECTS, value, onChange, effect.id)}
            aria-label={`${effect.name} background`}
            className={cn(
              'flex flex-col overflow-hidden rounded-card border text-left focus-ring transition',
              checked
                ? 'border-primary ring-2 ring-primary'
                : 'border-border hover:border-border-strong',
            )}
          >
            <svg
              viewBox="0 0 100 70"
              preserveAspectRatio="xMidYMid slice"
              className="h-16 w-full bg-surface-muted text-foreground"
              aria-hidden="true"
            >
              <Preview effect={effect.id} />
            </svg>
            <span className="flex items-start justify-between gap-2 border-t border-border bg-surface px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{effect.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {effect.description}
                </span>
              </span>
              {checked && (
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3.5" aria-hidden="true" />
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
