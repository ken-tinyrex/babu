import { FillGradient } from 'pixi.js';

type Stop = { offset: number; color: string };

/**
 * Vertical linear gradient in the shape's own coordinates (y0 → y1).
 * Built per layout instead of using textureSpace 'local', which rendered
 * vertical gradients incorrectly in testing.
 */
export function verticalGradient(y0: number, y1: number, colorStops: Stop[]): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: y0 },
    end: { x: 0, y: y1 },
    colorStops,
    textureSpace: 'global',
  });
}

/** Replaces a cached gradient, freeing the old texture. */
export function swapGradient(old: FillGradient | null, next: FillGradient): FillGradient {
  old?.destroy();
  return next;
}
