import { useLayoutEffect, useRef, useState } from 'react';
import { labelIndexes, niceScale } from '@/lib/chart-math';

export interface BarDatum {
  key: string;
  /** Short x-axis label. */
  label: string;
  /** Tooltip heading (e.g. the full period). */
  title: string;
  /** Bar height in whole units (counts or cents). */
  value: number;
  /** Tooltip lines. */
  details: string[];
}

const HEIGHT = 224;
const MARGIN = { top: 12, right: 8, bottom: 28 };
const FALLBACK_WIDTH = 640;

/** Width of an element, following resizes (fallback when ResizeObserver is missing). */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Measure before the first paint (no flash at the fallback width), then follow resizes.
    if (element.clientWidth > 0) setWidth(element.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const describe = (datum: BarDatum) => `${datum.title}: ${datum.details.join(', ')}`;

/**
 * A responsive vertical bar chart in plain SVG: one bar per period (no
 * interpolation between periods), gridlines and labels from theme tokens,
 * and a tooltip for the hovered or keyboard-selected bar. Keyboard users move
 * between bars with a native range input (←/→, Home/End), whose value text
 * reads each bar to screen readers.
 */
export function BarChart({
  data,
  label,
  formatTick,
}: {
  data: BarDatum[];
  /** Accessible name of the chart. */
  label: string;
  formatTick: (value: number) => string;
}) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const scale = niceScale(Math.max(0, ...data.map((datum) => datum.value)));
  const tickLabels = scale.ticks.map(formatTick);
  const left = Math.min(72, 12 + Math.max(...tickLabels.map((tick) => tick.length)) * 7);
  const innerWidth = Math.max(40, width - left - MARGIN.right);
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const band = innerWidth / Math.max(1, data.length);
  const barWidth = Math.max(2, Math.min(36, band * 0.7));
  const y = (value: number) => MARGIN.top + innerHeight - (value / scale.max) * innerHeight;
  const shownLabels = new Set(labelIndexes(data.length, Math.floor(innerWidth / 64)));
  const activeDatum = active === null ? undefined : data[active];
  const selected = data[active ?? 0];

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="range"
        min={0}
        max={Math.max(0, data.length - 1)}
        step={1}
        value={active ?? 0}
        aria-label={`${label}: choose a period`}
        aria-valuetext={selected ? describe(selected) : undefined}
        onChange={(event) => setActive(Number(event.target.value))}
        onFocus={() => setActive((current) => current ?? 0)}
        onBlur={() => setActive(null)}
        className="peer sr-only"
      />
      <div className="rounded-control peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          aria-hidden="true"
          className="block max-w-full overflow-visible"
          onMouseLeave={() => setActive(null)}
          onMouseMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const index = Math.floor((event.clientX - box.left - left) / band);
            setActive(index >= 0 && index < data.length ? index : null);
          }}
        >
          {scale.ticks.map((tick, index) => (
            <g key={tick}>
              <line
                x1={left}
                x2={left + innerWidth}
                y1={y(tick)}
                y2={y(tick)}
                className={index === 0 ? 'stroke-border-strong' : 'stroke-border'}
                strokeDasharray={index === 0 ? undefined : '3 3'}
              />
              <text
                x={left - 8}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-[0.6875rem] tabular-nums"
              >
                {tickLabels[index]}
              </text>
            </g>
          ))}
          {data.map((datum, index) => {
            const x = left + index * band + (band - barWidth) / 2;
            const top = y(datum.value);
            const isActive = index === active;
            return (
              <g key={datum.key} data-testid="chart-bar" data-value={datum.value}>
                {isActive && (
                  <rect
                    x={left + index * band}
                    y={MARGIN.top}
                    width={band}
                    height={innerHeight}
                    className="fill-surface-muted"
                  />
                )}
                {datum.value > 0 && (
                  <rect
                    x={x}
                    y={top}
                    width={barWidth}
                    height={MARGIN.top + innerHeight - top}
                    rx={Math.min(3, barWidth / 4)}
                    className={isActive ? 'fill-primary-hover' : 'fill-primary'}
                  />
                )}
                {shownLabels.has(index) && (
                  <text
                    x={left + index * band + band / 2}
                    y={HEIGHT - 8}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[0.6875rem]"
                  >
                    {datum.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {activeDatum && active !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-max max-w-56 -translate-x-1/2 rounded-control border border-border bg-surface px-3 py-2 text-xs shadow-raised"
          style={{
            left: Math.min(Math.max(left + active * band + band / 2, 80), Math.max(80, width - 80)),
          }}
          aria-hidden="true"
        >
          <p className="font-medium text-foreground">{activeDatum.title}</p>
          {activeDatum.details.map((line) => (
            <p key={line} className="text-muted-foreground tabular-nums">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
