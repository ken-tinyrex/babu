import { Assets, Container, FillGradient, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { Title } from '../data/types';
import type { Insets } from '../safeArea';
import { theme, type Metrics } from '../theme';
import { swapGradient, verticalGradient } from './gradient';

const bgHex = `#${theme.bg.toString(16).padStart(6, '0')}`;

/** Darkens the left side on wide screens so the text stays readable. */
const sideFade = new FillGradient({
  type: 'linear',
  start: { x: 0, y: 0 },
  end: { x: 1, y: 0 },
  colorStops: [
    { offset: 0, color: 'rgba(11,11,16,0.85)' },
    { offset: 0.6, color: 'rgba(11,11,16,0)' },
  ],
  textureSpace: 'local',
});

export class Hero extends Container {
  private artLayer = new Container();
  private clip = new Graphics();
  private shadeTop = new Graphics();
  private base = new Graphics();
  private deco = new Graphics();
  private art: Sprite | null = null;
  private shadeSide = new Graphics();
  private shadeBottom = new Graphics();
  private titleText: Text;
  private meta: Text;
  private body: Text;
  private button = new Container();
  private buttonBg = new Graphics();
  private buttonLabel: Text;
  private w = 0;
  private h = 0;
  private topGrad: FillGradient | null = null;
  private bottomGrad: FillGradient | null = null;

  constructor(
    private item: Title,
    onPlay: (item: Title) => void,
  ) {
    super();
    this.titleText = new Text({
      text: item.name,
      style: { fontFamily: theme.font, fontWeight: '800', fill: theme.text, wordWrap: true, lineHeight: 0 },
    });
    this.meta = new Text({
      text: [item.year, item.duration].filter(Boolean).join('  ·  '),
      style: { fontFamily: theme.font, fontWeight: '600', fill: theme.textMuted },
    });
    this.body = new Text({
      text: item.description,
      style: { fontFamily: theme.font, fill: 0xdddde6, wordWrap: true },
    });
    this.buttonLabel = new Text({
      text: '▶  Play',
      style: { fontFamily: theme.font, fontWeight: '700', fill: 0x000000 },
    });
    this.buttonLabel.anchor.set(0.5);
    this.button.addChild(this.buttonBg, this.buttonLabel);
    this.button.eventMode = 'static';
    this.button.cursor = 'pointer';
    this.button.on('pointertap', () => onPlay(this.item));

    this.artLayer.addChild(this.base, this.deco);
    this.artLayer.mask = this.clip;
    this.addChild(this.artLayer, this.clip, this.shadeTop, this.shadeSide, this.shadeBottom, this.titleText, this.meta, this.body, this.button);
    if (item.thumbnail) void this.loadArt(item.thumbnail);
  }

  get heroHeight() {
    return this.h;
  }

  layout(m: Metrics, width: number, safe: Insets) {
    this.w = width;
    this.h = m.heroH + safe.top;
    const { w, h } = this;
    const mobile = m.bp === 'mobile';

    this.clip.clear().rect(0, 0, w, h).fill(0xffffff);
    this.base.clear().rect(0, 0, w, h).fill(this.item.color);
    // Placeholder art: soft circles, replaced visually by the thumbnail when loaded.
    this.deco
      .clear()
      .circle(w * 0.78, h * 0.3, Math.max(w, h) * 0.35)
      .fill({ color: 0xffffff, alpha: 0.08 })
      .circle(w * 0.62, h * 0.75, Math.max(w, h) * 0.25)
      .fill({ color: 0x000000, alpha: 0.12 });
    this.fitArt();

    const topH = (m.headerH + safe.top) * 1.8;
    this.topGrad = swapGradient(
      this.topGrad,
      verticalGradient(0, topH, [
        { offset: 0, color: 'rgba(0,0,0,0.55)' },
        { offset: 1, color: 'rgba(0,0,0,0)' },
      ]),
    );
    this.shadeTop.clear().rect(0, 0, w, topH).fill(this.topGrad);
    this.shadeSide.clear();
    if (!mobile) this.shadeSide.rect(0, 0, w, h).fill(sideFade);
    this.bottomGrad = swapGradient(
      this.bottomGrad,
      verticalGradient(h * 0.35, h, [
        { offset: 0, color: 'rgba(11,11,16,0)' },
        { offset: 1, color: bgHex },
      ]),
    );
    this.shadeBottom.clear().rect(0, h * 0.35, w, h * 0.65).fill(this.bottomGrad);

    const left = m.gutter + safe.left;
    const textW = mobile ? w - left - m.gutter - safe.right : Math.min(560, w * 0.5);

    this.titleText.style.fontSize = m.heroTitleSize;
    this.titleText.style.wordWrapWidth = textW;
    this.meta.style.fontSize = m.heroBodySize - 1;
    this.body.style.fontSize = m.heroBodySize;
    this.body.style.wordWrapWidth = textW;
    this.body.style.lineHeight = Math.round(m.heroBodySize * 1.45);

    const btnH = mobile ? 44 : 48;
    const btnW = mobile ? textW : 150;
    this.buttonLabel.style.fontSize = mobile ? 16 : 17;
    this.buttonBg.clear().roundRect(0, 0, btnW, btnH, 8).fill(0xffffff);
    this.buttonLabel.position.set(btnW / 2, btnH / 2);

    // Stack from the bottom up.
    let y = h - m.gutter - btnH;
    this.button.position.set(left, y);
    y -= 18 + this.body.height;
    this.body.position.set(left, y);
    y -= 10 + this.meta.height;
    this.meta.position.set(left, y);
    y -= 6 + this.titleText.height;
    this.titleText.position.set(left, y);
  }

  private async loadArt(url: string) {
    try {
      const tex = await Assets.load<Texture>(url);
      if (this.destroyed) return;
      this.art = new Sprite(tex);
      this.art.anchor.set(0.5);
      this.artLayer.addChild(this.art);
      this.deco.visible = false;
      this.fitArt();
    } catch {
      // Keep placeholder.
    }
  }

  private fitArt() {
    if (!this.art || !this.w) return;
    const t = this.art.texture;
    this.art.scale.set(Math.max(this.w / t.width, this.h / t.height));
    this.art.position.set(this.w / 2, this.h / 2);
  }
}
