import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { Insets } from '../safeArea';
import { theme, type Metrics } from '../theme';

const NAV = ['Home', 'Movies', 'Shows', 'My List'];

/** How much of the mascot overlaps the top of the wordmark (paws resting on the letters). */
const PERCH_OVERLAP = 0.22;

const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export class Header extends Container {
  private bg = new Graphics();
  private brand = new Container();
  private logo: Text;
  private mascot: Sprite | null;
  private nav: Text[];
  private time = 0;
  private mascotScale = 1;

  constructor(mascotTexture: Texture | null) {
    super();
    this.logo = new Text({
      text: 'Babu',
      style: {
        fontFamily: theme.font,
        fontWeight: '900',
        fill: theme.accent,
        letterSpacing: -0.5,
        // Keeps the wordmark readable over bright hero art.
        dropShadow: { color: 0x000000, alpha: 0.45, blur: 6, distance: 1, angle: Math.PI / 2 },
      },
    });

    this.mascot = mascotTexture ? new Sprite(mascotTexture) : null;
    if (this.mascot) this.mascot.anchor.set(0.5, 1); // bottom-center, so the bob "breathes" from the paws

    this.brand.addChild(this.logo);
    if (this.mascot) this.brand.addChild(this.mascot);

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
    this.addChild(this.bg, this.brand, ...this.nav);
  }

  layout(m: Metrics, width: number, safe: Insets) {
    const h = m.headerH + safe.top;
    const left = m.gutter + safe.left;
    const fontSize = m.bp === 'mobile' ? 24 : m.bp === 'tablet' ? 28 : 32;

    this.bg.clear().rect(0, 0, width, h).fill(theme.bg);
    this.logo.style.fontSize = fontSize;

    // Stack: mascot perched on top of the wordmark, block centered in the header bar.
    const textH = this.logo.height;
    const capTop = textH * 0.18; // Text bounds include space above the cap height
    let mascotH = 0;
    if (this.mascot) {
      mascotH = Math.round(fontSize * 1.35);
      this.mascotScale = mascotH / this.mascot.texture.height;
      this.mascot.scale.set(this.mascotScale);
    }
    const visibleMascot = mascotH * (1 - PERCH_OVERLAP);
    const blockH = visibleMascot + textH - capTop;
    const blockTop = safe.top + (m.headerH - blockH) / 2;

    this.brand.position.set(left, blockTop);
    this.logo.position.set(0, visibleMascot - capTop);
    this.mascot?.position.set(this.logo.width / 2, mascotH);

    const navY = blockTop + this.logo.y + textH / 2;
    const showNav = m.bp !== 'mobile';
    let x = left + Math.max(this.logo.width, this.mascot?.width ?? 0) + (m.bp === 'desktop' ? 40 : 28);
    for (const t of this.nav) {
      t.visible = showNav;
      t.style.fontSize = m.bp === 'desktop' ? 16 : 15;
      t.position.set(x, navY);
      x += t.width + (m.bp === 'desktop' ? 28 : 20);
    }
  }

  /** Gentle breathing bob for the mascot. */
  update(dt: number) {
    if (!this.mascot || reducedMotion) return;
    this.time += dt / 60;
    const breathe = Math.sin(this.time * 2.4);
    this.mascot.scale.set(this.mascotScale * (1 + breathe * 0.012), this.mascotScale * (1 + breathe * 0.03));
  }

  /** 0 = transparent over the hero, 1 = solid. */
  setSolidity(p: number) {
    this.bg.alpha = Math.min(1, Math.max(0, p)) * 0.96;
  }
}
