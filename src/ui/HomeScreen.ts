import { Container, type Application, type FederatedPointerEvent, type Texture } from 'pixi.js';
import type { Catalog, Title } from '../data/types';
import { readSafeArea } from '../safeArea';
import { metricsFor, type Metrics } from '../theme';
import { Header } from './Header';
import { Hero } from './Hero';
import { Row } from './Row';
import { Scroller } from './Scroller';

const DRAG_THRESHOLD = 8; // px before a press becomes a drag (and stops being a tap)

interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  axis: 'x' | 'y' | null;
  row: Row | null;
}

/**
 * Browse screen: hero + shelves in a vertically scrolling page, fixed header on top.
 * One gesture handler on the stage decides per drag whether it scrolls the page (vertical)
 * or the shelf under the finger (horizontal), so touch, mouse-drag and wheel all work.
 */
export class HomeScreen extends Container {
  private content = new Container();
  private header: Header;
  private hero!: Hero;
  private rows: Row[] = [];
  private play: (item: Title) => void;
  private info: (item: Title) => void;
  private activeTab = -1;
  private page = new Scroller();
  private gesture: Gesture | null = null;
  private dragged = false;
  private m!: Metrics;

  /**
   * @param tabs Home + one tab per Jellyfin library, each with its own hero and rows.
   * @param onTabChange called after the user switches tabs (used to update the URL).
   */
  constructor(
    private app: Application,
    private tabs: { label: string; catalog: Catalog }[],
    onPlay: (item: Title) => void,
    onInfo: (item: Title) => void,
    mascot: Texture | null,
    initialTab = 0,
    private onTabChange?: (index: number) => void,
  ) {
    super();
    // Swallow taps that were really the end of a drag.
    this.play = (item) => {
      if (!this.dragged) onPlay(item);
    };
    this.info = (item) => {
      if (!this.dragged) onInfo(item);
    };
    this.header = new Header(
      mascot,
      tabs.map((t) => t.label),
      (i) => {
        if (!this.dragged) this.selectTab(i);
      },
    );
    this.addChild(this.content, this.header);
    this.bindInput();
    this.selectTab(initialTab, false);
  }

  /** Shows a tab's hero and rows and scrolls back to the top. */
  selectTab(index: number, notify = true) {
    const i = Math.max(0, Math.min(this.tabs.length - 1, index));
    if (i === this.activeTab) return;
    this.activeTab = i;
    this.header.setActive(i);

    const old = [this.hero, ...this.rows].filter(Boolean);
    this.content.removeChildren();
    for (const c of old) c.destroy({ children: true });

    const catalog = this.tabs[i].catalog;
    this.hero = new Hero(catalog.featured, this.play, this.info);
    this.rows = catalog.shelves.map((s) => new Row(s, this.info));
    this.content.addChild(this.hero, ...this.rows);
    this.page.setBounds(0, 0);
    this.page.value = 0;
    if (this.m) this.layout();
    if (notify) this.onTabChange?.(i);
  }

  layout() {
    const { width, height } = this.app.screen;
    const safe = readSafeArea();
    this.m = metricsFor(width, height);

    this.header.layout(this.m, width, safe);
    this.hero.layout(this.m, width, safe);

    let y = this.hero.heroHeight + Math.round(this.m.rowGap * 0.25);
    for (const row of this.rows) {
      row.layout(this.m, width, safe.left, safe.right);
      row.y = y;
      y += row.rowHeight + this.m.rowGap;
    }
    const contentH = y + safe.bottom + this.m.gutter;
    this.page.setBounds(0, contentH - height);
  }

  update(dt: number) {
    this.page.update(dt);
    this.content.y = -this.page.value;
    for (const r of this.rows) r.update(dt);
    this.header.update(dt);
    this.header.setSolidity(this.page.value / (this.m.heroH * 0.4));
  }

  private bindInput() {
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;

    stage.on('pointerdown', this.onDown);
    stage.on('globalpointermove', this.onMove);
    stage.on('pointerup', this.onUp);
    stage.on('pointerupoutside', this.onUp);

    this.app.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.app.screen.height : 1;
        const dx = (e.shiftKey ? e.deltaY : e.deltaX) * unit;
        const dy = (e.shiftKey ? 0 : e.deltaY) * unit;
        if (Math.abs(dx) > Math.abs(dy)) {
          const rect = this.app.canvas.getBoundingClientRect();
          this.rowAt(e.clientX - rect.left, e.clientY - rect.top)?.scroller.scrollBy(dx);
        } else {
          this.page.scrollBy(dy);
        }
      },
      { passive: false },
    );
  }

  private rowAt(x: number, y: number): Row | null {
    return this.rows.find((r) => r.hitsStrip(x, y)) ?? null;
  }

  private onDown = (e: FederatedPointerEvent) => {
    if (this.gesture) return; // ignore extra fingers
    this.dragged = false;
    const { x, y } = e.global;
    this.gesture = { pointerId: e.pointerId, startX: x, startY: y, lastX: x, lastY: y, axis: null, row: this.rowAt(x, y) };
  };

  private onMove = (e: FederatedPointerEvent) => {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    const { x, y } = e.global;

    if (!g.axis) {
      const dx = x - g.startX;
      const dy = y - g.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      g.axis = Math.abs(dx) > Math.abs(dy) && g.row ? 'x' : 'y';
      this.dragged = true;
      (g.axis === 'x' ? g.row!.scroller : this.page).beginDrag();
    }

    if (g.axis === 'x') g.row!.scroller.dragBy(g.lastX - x);
    else this.page.dragBy(g.lastY - y);
    g.lastX = x;
    g.lastY = y;
  };

  private onUp = (e: FederatedPointerEvent) => {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    if (g.axis === 'x') g.row!.scroller.endDrag();
    else if (g.axis === 'y') this.page.endDrag();
    this.gesture = null;
  };
}
