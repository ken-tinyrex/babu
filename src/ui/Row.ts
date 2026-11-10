import { Container, Graphics, Text } from 'pixi.js';
import type { Shelf, Title } from '../data/types';
import { theme, type Metrics } from '../theme';
import { PosterCard } from './PosterCard';
import { Scroller } from './Scroller';

/** A titled, horizontally scrollable shelf of posters. */
export class Row extends Container {
  readonly scroller = new Scroller();
  private title: Text;
  private viewport = new Container();
  private track = new Container();
  private clip = new Graphics();
  private cards: PosterCard[];
  private posterH = 0;
  private titleH = 0;

  constructor(shelf: Shelf, onSelect: (item: Title) => void) {
    super();
    this.title = new Text({
      text: shelf.label,
      style: { fontFamily: theme.font, fontWeight: '700', fill: theme.text },
    });
    this.cards = shelf.items.map((item) => new PosterCard(item, onSelect));
    this.track.addChild(...this.cards);
    this.viewport.addChild(this.track, this.clip);
    this.viewport.mask = this.clip;
    this.addChild(this.title, this.viewport);
  }

  get rowHeight() {
    return this.titleH + this.posterH;
  }

  layout(m: Metrics, width: number, insetLeft: number, insetRight: number) {
    const left = m.gutter + insetLeft;
    this.title.style.fontSize = m.rowTitleSize;
    this.title.position.set(left, 0);
    this.titleH = Math.ceil(m.rowTitleSize * 1.3) + 10;

    this.posterH = m.posterH;
    this.viewport.y = this.titleH;

    this.cards.forEach((card, i) => {
      card.resize(m.posterW, m.posterH);
      card.position.set(left + i * (m.posterW + m.posterGap), 0);
    });

    // Leave room above/below so hover-scaled cards aren't clipped.
    const pad = Math.ceil(m.posterH * 0.05);
    this.clip.clear().rect(0, -pad, width, m.posterH + pad * 2).fill(0xffffff);

    const n = this.cards.length;
    const contentW = left + n * m.posterW + (n - 1) * m.posterGap + m.gutter + insetRight;
    this.scroller.setBounds(0, contentW - width);
  }

  /** True if a global point lies over the poster strip (used to route horizontal drags). */
  hitsStrip(globalX: number, globalY: number) {
    const p = this.viewport.toLocal({ x: globalX, y: globalY });
    return p.y >= 0 && p.y <= this.posterH;
  }

  update(dt: number) {
    this.scroller.update(dt);
    this.track.x = -this.scroller.value;
    for (const c of this.cards) c.update(dt);
  }
}
