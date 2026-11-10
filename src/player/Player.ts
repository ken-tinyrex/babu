import type Hls from 'hls.js';
import type { Title } from '../data/types';

const isHls = (url: string) => /\.m3u8(\?|$)/i.test(url);

/**
 * Playback lives in the DOM, not in Pixi: native <video> gives iOS fullscreen,
 * AirPlay/PiP, hardware decoding and progressive streaming (HTTP range requests).
 */
export class Player {
  onOpen?: () => void;
  onClose?: () => void;

  private root = document.getElementById('player') as HTMLDivElement;
  private stage = this.root.querySelector('.player__stage') as HTMLDivElement;
  private titleEl = this.root.querySelector('.player__title') as HTMLDivElement;
  private hls: Hls | null = null;
  private token = 0;

  constructor() {
    this.root.querySelector('.player__close')!.addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.root.hidden) this.close();
    });
  }

  get isOpen() {
    return !this.root.hidden;
  }

  /** Call directly from a tap handler so mobile browsers treat play() as user-initiated. */
  async open(title: Title): Promise<void> {
    const token = ++this.token;
    this.teardown();
    this.titleEl.textContent = title.name;
    this.root.hidden = false;
    this.onOpen?.();

    if (title.source.kind === 'embed') {
      if (!/^https:\/\//i.test(title.source.url)) return this.showError('Embed URL must use https.');
      const frame = document.createElement('iframe');
      frame.src = title.source.url;
      frame.title = title.name;
      frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'origin';
      this.stage.append(frame);
      return;
    }

    const url = title.source.url;
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.autoplay = true;
    if (title.thumbnail) video.poster = title.thumbnail;
    video.addEventListener('error', () => this.showError('This video could not be played.'));
    this.stage.append(video);

    if (isHls(url) && !video.canPlayType('application/vnd.apple.mpegurl')) {
      // Chrome / Firefox / Android: MSE via hls.js (loaded on demand).
      const { default: HlsCtor } = await import('hls.js');
      if (token !== this.token) return;
      if (!HlsCtor.isSupported()) return this.showError('HLS playback is not supported in this browser.');
      const hls = new HlsCtor();
      this.hls = hls;
      hls.on(HlsCtor.Events.ERROR, (_e, data) => {
        if (data.fatal) this.showError('Stream failed to load.');
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      // MP4 everywhere, and native HLS on Safari / iOS.
      video.src = url;
    }
    video.play().catch(() => {
      /* Autoplay blocked; controls are visible so the user can press play. */
    });
  }

  close(): void {
    if (this.root.hidden) return;
    this.token++;
    this.teardown();
    this.root.hidden = true;
    this.onClose?.();
  }

  private showError(message: string) {
    this.teardown();
    const el = document.createElement('div');
    el.className = 'player__error';
    el.textContent = message;
    this.stage.append(el);
  }

  private teardown() {
    this.hls?.destroy();
    this.hls = null;
    for (const v of this.stage.querySelectorAll('video')) {
      v.pause();
      v.removeAttribute('src');
      v.load();
    }
    this.stage.replaceChildren();
  }
}
