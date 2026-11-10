/**
 * 1D scroll model with drag, momentum and rubber-band edges.
 * `value` is the scroll offset (0 = start); views render at -value.
 */
export class Scroller {
  value = 0;
  min = 0;
  max = 0;
  private velocity = 0; // px per frame (60fps frame)
  private dragging = false;
  private lastMove = 0;

  setBounds(min: number, max: number) {
    this.min = min;
    this.max = Math.max(min, max);
    if (!this.dragging) this.value = Math.min(this.max, Math.max(this.min, this.value));
  }

  beginDrag() {
    this.dragging = true;
    this.velocity = 0;
    this.lastMove = performance.now();
  }

  /** delta > 0 scrolls forward (content moves left / up). */
  dragBy(delta: number) {
    const now = performance.now();
    const dt = Math.max(1, now - this.lastMove);
    this.lastMove = now;
    const out = this.value < this.min || this.value > this.max;
    this.value += out ? delta * 0.35 : delta;
    const v = (delta / dt) * 16.67;
    this.velocity = this.velocity * 0.2 + v * 0.8;
  }

  endDrag() {
    this.dragging = false;
    // Finger paused before lifting: no fling.
    if (performance.now() - this.lastMove > 80) this.velocity = 0;
  }

  /** Mouse wheel / trackpad: direct, no momentum (the OS already provides it). */
  scrollBy(delta: number) {
    this.velocity = 0;
    this.value = Math.min(this.max, Math.max(this.min, this.value + delta));
  }

  /** dt = ticker.deltaTime (1 at 60fps). */
  update(dt: number) {
    if (this.dragging) return;

    if (this.velocity !== 0) {
      this.value += this.velocity * dt;
      this.velocity *= Math.pow(0.94, dt);
      if (Math.abs(this.velocity) < 0.05) this.velocity = 0;
    }

    const target = this.value < this.min ? this.min : this.value > this.max ? this.max : null;
    if (target !== null) {
      this.velocity *= 0.5;
      this.value += (target - this.value) * Math.min(1, 0.18 * dt);
      if (Math.abs(target - this.value) < 0.5) {
        this.value = target;
        this.velocity = 0;
      }
    }
  }
}
