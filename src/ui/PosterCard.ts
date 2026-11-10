import { Assets, Container, Graphics, Sprite, Text, type FillGradient, type Texture } from 'pixi.js';
import type { Title } from '../data/types';
import { theme } from '../theme';
import { swapGradient, verticalGradient } from './gradient';

export class PosterCard extends Container {
  private body = new Container();
  private bg = new Graphics();
  private art: Sprite | null = null;
  private artMask = new Graphics();
  private overlay = new Graphics();
  private initial: Text;
  private nameText: Text;
  private w = 0;
  private h = 0;
  private targetScale = 1;
  private shade: FillGradient | null = null;

  constructor(
    readonly item: Title,
    onTap: (item: Title) => void,
  ) {
    super();
    this.eventMode = 'static';
    this.cursor = 'pointer';

    this.initial = new Text({
      text: item.name.charAt(0).toUpperCase(),
      style: { fontFamily: theme.font, fontWeight: '800', fill: 0xffffff },
    });
    this.initial.alpha = 0.18;
    this.initial.anchor.set(0.5);

    this.nameText = new Text({
      text: item.name,
      style: { fontFamily: theme.font, fontWeight: '600', fill: theme.text, wordWrap: true, breakWords: true },
    });
    this.nameText.anchor.set(0, 1);

    this.body.addChild(this.bg, this.initial, this.overlay, this.nameText);
    this.addChild(this.body);

    this.on('pointertap', () => onTap(item));
    this.on('pointerover', (e) => {
      if (e.pointerType === 'mouse') this.targetScale = 1.06;
    });
    this.on('pointerout', () => (this.targetScale = 1));

    if (item.poster) void this.loadArt(item.poster);
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const r = Math.round(w * 0.06);

    this.bg.clear().roundRect(0, 0, w, h, r).fill(this.item.color);
    this.artMask.clear().roundRect(0, 0, w, h, r).fill(0xffffff);
    this.shade = swapGradient(
      this.shade,
      verticalGradient(h * 0.45, h, [
        { offset: 0, color: 'rgba(0,0,0,0)' },
        { offset: 1, color: 'rgba(0,0,0,0.85)' },
      ]),
    );
    this.overlay.clear().roundRect(0, 0, w, h, r).fill(this.shade);

    this.initial.style.fontSize = Math.round(w * 0.7);
    this.initial.position.set(w / 2, h * 0.4);

    const pad = Math.round(w * 0.07);
    this.nameText.style.fontSize = Math.max(11, Math.min(17, Math.round(w * 0.1)));
    this.nameText.style.wordWrapWidth = w - pad * 2;
    this.nameText.position.set(pad, h - pad);

    this.fitArt();
    this.body.pivot.set(w / 2, h / 2);
    this.body.position.set(w / 2, h / 2);
    this.hitArea = { contains: (x: number, y: number) => x >= 0 && y >= 0 && x <= this.w && y <= this.h };
  }

  update(dt: number) {
    const s = this.body.scale.x;
    if (s !== this.targetScale) {
      const next = s + (this.targetScale - s) * Math.min(1, 0.25 * dt);
      this.body.scale.set(Math.abs(next - this.targetScale) < 0.001 ? this.targetScale : next);
    }
  }

  private async loadArt(url: string) {
    try {
      const tex = await Assets.load<Texture>(url);
      if (this.destroyed) return;
      this.art = new Sprite(tex);
      this.art.anchor.set(0.5);
      this.art.mask = this.artMask;
      // Mask shape is only added once there is art to clip (it would otherwise draw as a white card).
      const at = this.body.getChildIndex(this.overlay);
      this.body.addChildAt(this.artMask, at);
      this.body.addChildAt(this.art, at);
      this.initial.visible = false;
      this.fitArt();
    } catch {
      // No CORS / 404 / unsupported format: keep the drawn placeholder.
    }
  }

  private fitArt() {
    if (!this.art || !this.w) return;
    const tex = this.art.texture;
    const scale = Math.max(this.w / tex.width, this.h / tex.height);
    this.art.scale.set(scale);
    this.art.position.set(this.w / 2, this.h / 2);
  }
}
