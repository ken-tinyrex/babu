import { Container, Graphics, Text } from 'pixi.js';
import type { Insets } from '../safeArea';
import { theme, type Metrics } from '../theme';

const NAV = ['Home', 'Movies', 'Shows', 'My List'];

export class Header extends Container {
  private bg = new Graphics();
  private logo: Text;
  private nav: Text[];

  constructor() {
    super();
    this.logo = new Text({
      text: 'Babu',
      style: { fontFamily: theme.font, fontWeight: '900', fill: theme.accent, letterSpacing: -0.5 },
    });
    this.logo.anchor.set(0, 0.5);
    this.nav = NAV.map((label, i) => {
      const t = new Text({
        text: label,
        style: { fontFamily: theme.font, fontWeight: i === 0 ? '700' : '500', fill: i === 0 ? theme.text : theme.textMuted },
      });
      t.anchor.set(0, 0.5);
      t.eventMode = 'static';
      t.cursor = 'pointer';
      return t;
    });
    this.addChild(this.bg, this.logo, ...this.nav);
  }

  layout(m: Metrics, width: number, safe: Insets) {
    const h = m.headerH + safe.top;
    const cy = safe.top + m.headerH / 2;
    const left = m.gutter + safe.left;

    this.bg.clear().rect(0, 0, width, h).fill(theme.bg);
    this.logo.style.fontSize = m.bp === 'mobile' ? 26 : 32;
    this.logo.position.set(left, cy);

    const showNav = m.bp !== 'mobile';
    let x = left + this.logo.width + (m.bp === 'desktop' ? 40 : 28);
    for (const t of this.nav) {
      t.visible = showNav;
      t.style.fontSize = m.bp === 'desktop' ? 16 : 15;
      t.position.set(x, cy);
      x += t.width + (m.bp === 'desktop' ? 28 : 20);
    }
  }

  /** 0 = transparent over the hero, 1 = solid. */
  setSolidity(p: number) {
    this.bg.alpha = Math.min(1, Math.max(0, p)) * 0.96;
  }
}
