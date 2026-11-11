import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { Insets } from '../safeArea';
import { theme, type Metrics } from '../theme';

/** How much of the mascot overlaps the top of the wordmark (paws resting on the letters). */
const PERCH_OVERLAP = 0.22;
/** Height of the second header row that holds the tabs on phones. */
export const MOBILE_TABS_H = 38;

const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Top bar: Babu mascot + wordmark and the tabs (Home + one per Jellyfin library).
 * Tabs sit beside the logo on tablet/desktop and on their own row on phones.
 */
export class Header extends Container {
  private bg = new Graphics();
  private brand = new Container();
  private logo: Text;
  private mascot: Sprite | null;
  private tabs: Text[];
  private underline = new Graphics();
  /** Dark band behind the phone tab row so labels stay readable over artwork. */
  private tabsBg = new Graphics();
  private active = 0;
  private time = 0;
  private mascotScale = 1;
  private barH = 0;

  constructor(mascotTexture: Texture | null, tabLabels: string[], onTab: (index: number) => void) {
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

    // A single tab (just "Home") isn't worth showing.
    const labels = tabLabels.length > 1 ? tabLabels : [];
    this.tabs = labels.map((label, i) => {
      const t = new Text({
        text: label,
        style: {
          fontFamily: theme.font,
          fontWeight: '600',
          fill: theme.textMuted,
          dropShadow: { color: 0x000000, alpha: 0.5, blur: 6, distance: 0 },
        },
      });
      t.anchor.set(0, 0.5);
      t.eventMode = 'static';
      t.cursor = 'pointer';
      // Generous hit area so tabs are easy to tap on phones.
      t.hitArea = { contains: (x: number, y: number) => x >= -10 && x <= t.width + 10 && y >= -22 && y <= 22 };
      t.on('pointertap', () => onTab(i));
      return t;
    });

    this.addChild(this.bg, this.tabsBg, this.brand, this.underline, ...this.tabs);
    this.setActive(0);
  }

  /** Total height of the bar (taller on phones when tabs get their own row). */
  get barHeight() {
    return this.barH;
  }

  setActive(index: number) {
    this.active = index;
    this.tabs.forEach((t, i) => {
      t.style.fill = i === index ? theme.text : theme.textMuted;
      t.style.fontWeight = i === index ? '800' : '600';
    });
    this.drawUnderline();
  }

  layout(m: Metrics, width: number, safe: Insets) {
    const mobile = m.bp === 'mobile';
    const tabsRow = mobile && this.tabs.length > 0;
    this.barH = m.headerH + safe.top + (tabsRow ? MOBILE_TABS_H : 0);
    const left = m.gutter + safe.left;
    const fontSize = mobile ? 24 : m.bp === 'tablet' ? 28 : 32;

    this.bg.clear().rect(0, 0, width, this.barH).fill(theme.bg);
    this.tabsBg.clear();
    if (tabsRow) this.tabsBg.rect(0, safe.top + m.headerH - 6, width, MOBILE_TABS_H + 6).fill({ color: 0x000000, alpha: 0.55 });
    this.logo.style.fontSize = fontSize;

    // Stack: mascot perched on top of the wordmark, block centered in the logo row.
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

    if (tabsRow) {
      // Own row under the logo; shrink the text if the libraries don't fit.
      const avail = width - left - m.gutter - safe.right;
      let size = 15;
      let gap = 20;
      const measure = () => {
        for (const t of this.tabs) t.style.fontSize = size;
        return this.tabs.reduce((w, t) => w + t.width, 0) + gap * (this.tabs.length - 1);
      };
      while (measure() > avail && size > 11) {
        size -= 1;
        gap = Math.max(12, gap - 2);
      }
      const y = safe.top + m.headerH + MOBILE_TABS_H / 2 - 6;
      let x = left;
      for (const t of this.tabs) {
        t.position.set(x, y);
        x += t.width + gap;
      }
    } else {
      const navY = blockTop + this.logo.y + textH / 2;
      let x = left + Math.max(this.logo.width, this.mascot?.width ?? 0) + (m.bp === 'desktop' ? 40 : 28);
      for (const t of this.tabs) {
        t.style.fontSize = m.bp === 'desktop' ? 16 : 15;
        t.position.set(x, navY);
        x += t.width + (m.bp === 'desktop' ? 28 : 20);
      }
    }
    this.drawUnderline();
  }

  private drawUnderline() {
    this.underline.clear();
    const t = this.tabs[this.active];
    if (!t || !t.width) return;
    this.underline.roundRect(t.x, t.y + t.height / 2 + 4, t.width, 3, 1.5).fill(theme.accent);
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
