export const theme = {
  bg: 0x0b0b10,
  surface: 0x1a1a24,
  accent: 0xff4d6d,
  text: 0xffffff,
  textMuted: 0xa3a3b5,
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
} as const;

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

/** Everything that changes size between phone, tablet and desktop lives here. */
export interface Metrics {
  bp: Breakpoint;
  width: number;
  height: number;
  gutter: number;
  headerH: number;
  posterW: number;
  posterH: number;
  posterGap: number;
  rowTitleSize: number;
  rowGap: number;
  heroH: number;
  heroTitleSize: number;
  heroBodySize: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function breakpointFor(width: number): Breakpoint {
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

export function metricsFor(width: number, height: number): Metrics {
  const bp = breakpointFor(width);
  const base = {
    mobile: { gutter: 16, headerH: 68, posterW: 112, posterGap: 10, rowTitleSize: 16, rowGap: 22, heroTitleSize: 30, heroBodySize: 14 },
    tablet: { gutter: 24, headerH: 76, posterW: 140, posterGap: 12, rowTitleSize: 18, rowGap: 28, heroTitleSize: 42, heroBodySize: 15 },
    desktop: { gutter: 48, headerH: 88, posterW: 180, posterGap: 16, rowTitleSize: 22, rowGap: 36, heroTitleSize: 56, heroBodySize: 17 },
  }[bp];

  const heroH =
    bp === 'mobile'
      ? clamp(width * 1.15, 360, height * 0.75)
      : bp === 'tablet'
        ? clamp(width * 0.6, 380, height * 0.75)
        : clamp(width * 0.42, 420, height * 0.8);

  return { bp, width, height, ...base, posterH: Math.round(base.posterW * 1.5), heroH: Math.round(heroH) };
}
