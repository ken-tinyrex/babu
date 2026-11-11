import { Assets, BlurFilter, Container, FillGradient, Graphics, Sprite, Text, type Texture } from 'pixi.js';
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

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[,.;:\s]+$/, '')}…`;
}

class HeroButton extends Container {
  private bg = new Graphics();
  private caption: Text;

  constructor(
    text: string,
    private primary: boolean,
    onTap: () => void,
  ) {
    super();
    this.caption = new Text({
      text,
      style: { fontFamily: theme.font, fontWeight: '700', fill: primary ? 0x000000 : 0xffffff },
    });
    this.caption.anchor.set(0.5);
    this.addChild(this.bg, this.caption);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointertap', onTap);
  }

  layout(w: number, h: number, fontSize: number) {
    this.caption.style.fontSize = fontSize;
    this.bg
      .clear()
      .roundRect(0, 0, w, h, 8)
      .fill(this.primary ? { color: 0xffffff } : { color: 0xffffff, alpha: 0.2 });
    this.caption.position.set(w / 2, h / 2);
  }
}

/**
 * Featured title banner. Art:
 * - landscape backdrop → fills the banner
 * - only a portrait poster → phone: fills the banner; wider: blurred fill + sharp poster on the right
 * - nothing → title color with soft shapes
 */
export class Hero extends Container {
  private artLayer = new Container();
  private clip = new Graphics();
  private base = new Graphics();
  private deco = new Graphics();
  private cover: Sprite | null = null;
  private posterPanel = new Container();
  private posterShadow = new Graphics();
  private posterMask = new Graphics();
  private posterSprite: Sprite | null = null;
  private shadeTop = new Graphics();
  private shadeSide = new Graphics();
  private shadeBottom = new Graphics();
  private titleText: Text;
  private meta: Text;
  private body: Text;
  private playBtn: HeroButton;
  private infoBtn: HeroButton;
  private w = 0;
  private h = 0;
  private bp: Metrics['bp'] = 'desktop';
  private landscape = false;
  /** Bottom of the header bar; the side poster starts below it. */
  private headerBottom = 0;
  private topGrad: FillGradient | null = null;
  private bottomGrad: FillGradient | null = null;

  constructor(
    private item: Title,
    onPlay: (item: Title) => void,
    onInfo: (item: Title) => void,
  ) {
    super();
    const m = item.meta;
    this.titleText = new Text({
      text: item.name,
      style: { fontFamily: theme.font, fontWeight: '800', fill: theme.text, wordWrap: true, dropShadow: { color: 0x000000, alpha: 0.6, blur: 8, distance: 0 } },
    });
    this.meta = new Text({
      // Episodes lead with "S1:E2 · Title"; movies and shows with year and rating.
      text: (item.subtitle
        ? [item.subtitle, item.duration]
        : [item.year, m?.certification, item.duration, m?.genres?.slice(0, 2).join(', ')]
      ).filter(Boolean).join('  ·  '),
      style: { fontFamily: theme.font, fontWeight: '600', fill: 0xd6d6e0, dropShadow: { color: 0x000000, alpha: 0.6, blur: 8, distance: 0 } },
    });
    this.body = new Text({
      text: item.description,
      style: { fontFamily: theme.font, fill: 0xdddde6, wordWrap: true, dropShadow: { color: 0x000000, alpha: 0.6, blur: 8, distance: 0 } },
    });
    this.playBtn = new HeroButton('▶  Play', true, () => onPlay(this.item));
    this.infoBtn = new HeroButton('ⓘ  More info', false, () => onInfo(this.item));

    this.posterShadow.filters = [new BlurFilter({ strength: 18 })];
    this.posterPanel.addChild(this.posterShadow, this.posterMask);
    this.posterPanel.visible = false;

    this.artLayer.addChild(this.base, this.deco);
    this.artLayer.mask = this.clip;
    this.addChild(
      this.artLayer, this.clip, this.shadeTop, this.shadeSide, this.shadeBottom, this.posterPanel,
      this.titleText, this.meta, this.body, this.playBtn, this.infoBtn,
    );

    const art = item.backdrop ?? item.poster;
    this.landscape = !!item.backdrop;
    if (art) void this.loadArt(art);
  }

  get heroHeight() {
    return this.h;
  }

  layout(m: Metrics, width: number, safe: Insets) {
    this.w = width;
    this.h = m.heroH + safe.top;
    this.bp = m.bp;
    const { w, h } = this;
    const mobile = m.bp === 'mobile';

    this.clip.clear().rect(0, 0, w, h).fill(0xffffff);
    this.base.clear().rect(0, 0, w, h).fill(this.item.color);
    this.deco
      .clear()
      .circle(w * 0.78, h * 0.3, Math.max(w, h) * 0.35)
      .fill({ color: 0xffffff, alpha: 0.08 })
      .circle(w * 0.62, h * 0.75, Math.max(w, h) * 0.25)
      .fill({ color: 0x000000, alpha: 0.12 });

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
      // Starts higher on phones, where the text sits over the art rather than beside it.
      verticalGradient(h * (mobile ? 0.25 : 0.35), h, [
        { offset: 0, color: 'rgba(11,11,16,0)' },
        { offset: 0.55, color: 'rgba(11,11,16,0.75)' },
        { offset: 1, color: bgHex },
      ]),
    );
    const fadeTop = h * (mobile ? 0.25 : 0.35);
    this.shadeBottom.clear().rect(0, fadeTop, w, h - fadeTop).fill(this.bottomGrad);

    const left = m.gutter + safe.left;
    const textW = mobile ? w - left - m.gutter - safe.right : Math.min(560, w * 0.48);

    this.titleText.style.fontSize = m.heroTitleSize;
    this.titleText.style.wordWrapWidth = textW;
    this.titleText.style.lineHeight = Math.round(m.heroTitleSize * 1.08);
    this.meta.style.fontSize = m.heroBodySize - 1;
    this.body.text = truncate(this.item.description, mobile ? 150 : 240);
    this.body.style.fontSize = m.heroBodySize;
    this.body.style.wordWrapWidth = textW;
    this.body.style.lineHeight = Math.round(m.heroBodySize * 1.45);

    const btnH = mobile ? 44 : 48;
    const gap = 10;
    const playW = mobile ? (textW - gap) / 2 : 150;
    const infoW = mobile ? (textW - gap) / 2 : 170;
    const fs = mobile ? 16 : 17;
    this.playBtn.layout(playW, btnH, fs);
    this.infoBtn.layout(infoW, btnH, fs);

    // Stack from the bottom up.
    let y = h - m.gutter - btnH;
    this.playBtn.position.set(left, y);
    this.infoBtn.position.set(left + playW + gap, y);
    y -= 18 + this.body.height;
    this.body.position.set(left, y);
    y -= 10 + this.meta.height;
    this.meta.position.set(left, y);
    y -= 8 + this.titleText.height;
    this.titleText.position.set(left, y);

    this.headerBottom = m.headerH + safe.top;
    this.fitArt();
  }

  private async loadArt(url: string) {
    try {
      const tex = await Assets.load<Texture>({ src: url, parser: 'texture' });
      if (this.destroyed) return;
      this.cover = new Sprite(tex);
      this.cover.anchor.set(0.5);
      this.artLayer.addChild(this.cover);
      this.deco.visible = false;
      if (!this.landscape) {
        this.posterSprite = new Sprite(tex);
        this.posterSprite.mask = this.posterMask;
        this.posterPanel.addChild(this.posterSprite);
      }
      this.fitArt();
    } catch {
      // Keep the placeholder.
    }
  }

  private fitArt() {
    if (!this.cover || !this.w) return;
    const t = this.cover.texture;
    const { w, h } = this;
    const posterOnly = !this.landscape;
    const sidePoster = posterOnly && this.bp !== 'mobile';

    // Cover-fit; a portrait poster on a phone is anchored near its top (titles/faces live there).
    const s = Math.max(w / t.width, h / t.height);
    this.cover.scale.set(s);
    this.cover.position.set(w / 2, posterOnly && !sidePoster ? (t.height * s) / 2 - (t.height * s - h) * 0.15 : h / 2);
    this.cover.filters = sidePoster ? [new BlurFilter({ strength: 40, quality: 4 })] : [];
    this.cover.alpha = sidePoster ? 0.7 : 1;

    this.posterPanel.visible = sidePoster && !!this.posterSprite;
    if (!this.posterPanel.visible || !this.posterSprite) return;
    const top = Math.max(this.headerBottom, 24) + 16;
    const ph = Math.min(h - top - 40, 520);
    const pw = ph * (t.width / t.height);
    const r = 12;
    this.posterSprite.scale.set(ph / t.height);
    this.posterMask.clear().roundRect(0, 0, pw, ph, r).fill(0xffffff);
    this.posterShadow.clear().roundRect(6, 14, pw, ph, r).fill({ color: 0x000000, alpha: 0.6 });
    this.posterPanel.position.set(w - pw - Math.max(48, w * 0.08), top);
  }
}
