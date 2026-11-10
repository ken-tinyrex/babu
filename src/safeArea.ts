export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

let probe: HTMLDivElement | null = null;

/** Reads CSS env(safe-area-inset-*) (iPhone notch / home indicator) in CSS pixels. */
export function readSafeArea(): Insets {
  if (!probe) {
    probe = document.createElement('div');
    probe.className = 'safe-area-probe';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
}
