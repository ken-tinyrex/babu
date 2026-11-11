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
  private account = new Container();
  private accountBg = new Graphics();
  private accountText: Text;

  constructor(mascotTexture: Texture | null, account?: { label: string; onTap: () => void }) {
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
    // Account pill (top right): "Sign in" or the Jellyfin user's name.
    this.accountText = new Text({
      text: account?.label ?? '',
      style: { fontFamily: theme.font, fontWeight: '700', fill: theme.text },
    });
    this.accountText.anchor.set(0.5);
    this.account.addChild(this.accountBg, this.accountText);
    this.account.visible = !!account;
    this.account.eventMode = 'static';
    this.account.cursor = 'pointer';
    if (account) this.account.on('pointertap', account.onTap);

    this.addChild(this.bg, this.brand, ...this.nav, this.account);
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

    if (this.account.visible) {
      this.accountText.style.fontSize = m.bp === 'mobile' ? 14 : 15;
      const pw = Math.round(this.accountText.width + 28);
      const ph = m.bp === 'mobile' ? 34 : 38;
      this.accountBg.clear().roundRect(0, 0, pw, ph, ph / 2).fill({ color: 0xffffff, alpha: 0.14 }).stroke({ color: 0xffffff, alpha: 0.25, width: 1 });
      this.accountText.position.set(pw / 2, ph / 2);
      this.account.position.set(width - m.gutter - safe.right - pw, safe.top + (m.headerH - ph) / 2);
    }
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
