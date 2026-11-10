import type Hls from 'hls.js';
import type { Title } from '../data/types';
import { suppressGhostClicks } from '../ghostClick';

const isHls = (url: string) => /\.m3u8(\?|$)/i.test(url);

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
  volume:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z"/></svg>',
  muted:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9l5 6m0-6-5 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  fullscreen:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h5v2H7v3H5zm9 0h5v5h-2V7h-3zM5 14h2v3h3v2H5zm12 3v-3h2v5h-5v-2z"/></svg>',
};

const HIDE_CONTROLS_MS = 2800;

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  s = Math.floor(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Hopping Babu + walking paws; same markup as the boot screen in index.html. */
function createLoader(text: string): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'player__loading is-visible';
  wrap.setAttribute('role', 'status');
  wrap.innerHTML = `
    <div class="loader">
      <img class="loader__pup" src="/icons/logo.png" alt="" />
      <div class="loader__paws" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="loader__text"></div>
    </div>`;
  wrap.querySelector('.loader__text')!.textContent = text;
  return wrap;
}

type FullscreenDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => void };
type IOSVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

/**
 * Playback lives in the DOM, not in Pixi: <video> gives hardware decoding, progressive
 * streaming (HTTP range requests), AirPlay/PiP, and iOS native fullscreen.
 * Inline it uses Babu's own controls (with the paw seek bar).
 */
export class Player {
  onOpen?: () => void;
  onClose?: () => void;

  private root = document.getElementById('player') as HTMLDivElement;
  private stage = this.root.querySelector('.player__stage') as HTMLDivElement;
  private titleEl = this.root.querySelector('.player__title') as HTMLDivElement;
  private hls: Hls | null = null;
  private video: HTMLVideoElement | null = null;
  private token = 0;
  /** Removes every listener added for the current video in one go. */
  private session: AbortController | null = null;
  private hideTimer = 0;

  constructor() {
    this.root.querySelector('.player__close')!.addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  get isOpen() {
    return !this.root.hidden;
  }

  /** Call directly from a tap handler so mobile browsers treat play() as user-initiated. */
  async open(title: Title): Promise<void> {
    const token = ++this.token;
    suppressGhostClicks();
    this.teardown();
    this.session = new AbortController();
    this.titleEl.textContent = title.name;
    this.root.hidden = false;
    this.onOpen?.();

    const loader = createLoader('Babu is fetching…');
    this.stage.append(loader);
    const setLoading = (on: boolean) => loader.classList.toggle('is-visible', on);

    if (title.source.kind === 'embed') {
      if (!/^https:\/\//i.test(title.source.url)) return this.showError('Embed URL must use https.');
      const frame = document.createElement('iframe');
      frame.src = title.source.url;
      frame.title = title.name;
      frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'origin';
      frame.addEventListener('load', () => setLoading(false), { signal: this.session.signal });
      this.stage.prepend(frame);
      return;
    }

    const url = title.source.url;
    const video = document.createElement('video');
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'auto';
    const still = title.backdrop ?? title.poster;
    if (still) video.poster = still;
    this.video = video;
    this.stage.prepend(video);

    const on = { signal: this.session.signal };
    for (const ev of ['waiting', 'seeking', 'loadstart']) video.addEventListener(ev, () => setLoading(true), on);
    for (const ev of ['playing', 'canplay', 'seeked', 'pause']) video.addEventListener(ev, () => setLoading(false), on);
    video.addEventListener('error', () => this.showError('This video could not be played.'), on);

    this.buildControls(video, this.session.signal);

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
      // Autoplay blocked: show the big play button instead of the loader.
      setLoading(false);
    });
  }

  close(): void {
    if (this.root.hidden) return;
    const doc = document as FullscreenDoc;
    if (doc.fullscreenElement) void doc.exitFullscreen().catch(() => {});
    this.token++;
    this.teardown();
    this.root.hidden = true;
    this.onClose?.();
  }

  private buildControls(video: HTMLVideoElement, signal: AbortSignal) {
    const stage = this.stage;
    const on = { signal };

    const big = document.createElement('button');
    big.type = 'button';
    big.className = 'bigplay';
    big.setAttribute('aria-label', 'Play');
    big.innerHTML = ICON.play;

    const bar = document.createElement('div');
    bar.className = 'controls';
    bar.innerHTML = `
      <button class="ctl ctl--play" type="button" aria-label="Play">${ICON.play}</button>
      <span class="ctl-time ctl-time--cur">0:00</span>
      <input class="seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Seek" />
      <span class="ctl-time ctl-time--dur">0:00</span>
      <button class="ctl ctl--mute" type="button" aria-label="Mute">${ICON.volume}</button>
      <button class="ctl ctl--fs" type="button" aria-label="Fullscreen">${ICON.fullscreen}</button>`;
    stage.append(big, bar);

    const playBtn = bar.querySelector<HTMLButtonElement>('.ctl--play')!;
    const muteBtn = bar.querySelector<HTMLButtonElement>('.ctl--mute')!;
    const fsBtn = bar.querySelector<HTMLButtonElement>('.ctl--fs')!;
    const seek = bar.querySelector<HTMLInputElement>('.seek')!;
    const cur = bar.querySelector<HTMLSpanElement>('.ctl-time--cur')!;
    const dur = bar.querySelector<HTMLSpanElement>('.ctl-time--dur')!;

    let scrubbing = false;
    const pct = (t: number) => (video.duration > 0 ? Math.min(100, (t / video.duration) * 100) : 0);

    const renderTime = () => {
      if (scrubbing) return;
      seek.value = String(Math.round(pct(video.currentTime) * 10));
      seek.style.setProperty('--p', `${pct(video.currentTime)}%`);
      cur.textContent = formatTime(video.currentTime);
    };
    const renderBuffered = () => {
      const b = video.buffered;
      for (let i = 0; i < b.length; i++) {
        if (b.start(i) <= video.currentTime && video.currentTime <= b.end(i)) {
          seek.style.setProperty('--b', `${pct(b.end(i))}%`);
          return;
        }
      }
    };
    const renderPlayState = () => {
      const paused = video.paused;
      stage.classList.toggle('is-paused', paused);
      playBtn.innerHTML = paused ? ICON.play : ICON.pause;
      playBtn.setAttribute('aria-label', paused ? 'Play' : 'Pause');
      if (paused) this.showControls(false);
      else this.showControls(true);
    };

    video.addEventListener('timeupdate', renderTime, on);
    video.addEventListener('progress', renderBuffered, on);
    video.addEventListener('timeupdate', renderBuffered, on);
    video.addEventListener('durationchange', () => (dur.textContent = formatTime(video.duration)), on);
    video.addEventListener('play', renderPlayState, on);
    video.addEventListener('pause', renderPlayState, on);
    video.addEventListener('volumechange', () => {
      muteBtn.innerHTML = video.muted ? ICON.muted : ICON.volume;
      muteBtn.setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
    }, on);

    // Scrubbing: move the paw freely, seek as it moves, resume time updates on release.
    seek.addEventListener('input', () => {
      scrubbing = true;
      const p = seek.valueAsNumber / 10;
      seek.style.setProperty('--p', `${p}%`);
      if (video.duration > 0) {
        const t = (p / 100) * video.duration;
        cur.textContent = formatTime(t);
        video.currentTime = t;
      }
      this.showControls(true);
    }, on);
    seek.addEventListener('change', () => (scrubbing = false), on);

    const togglePlay = () => (video.paused ? void video.play().catch(() => {}) : video.pause());
    playBtn.addEventListener('click', togglePlay, on);
    big.addEventListener('click', togglePlay, on);
    muteBtn.addEventListener('click', () => (video.muted = !video.muted), on);
    fsBtn.addEventListener('click', () => this.toggleFullscreen(), on);

    // Mouse: click video toggles play. Touch: tap toggles the controls.
    video.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') togglePlay();
      else if (stage.classList.contains('controls-on') && !video.paused) this.hideControls();
      else this.showControls(true);
    }, on);
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') this.showControls(true);
    }, on);

    renderPlayState();
  }

  /** Shows the controls; if `autoHide`, hides them again after a pause in activity. */
  private showControls(autoHide: boolean) {
    this.stage.classList.add('controls-on');
    clearTimeout(this.hideTimer);
    if (autoHide) this.hideTimer = window.setTimeout(() => this.hideControls(), HIDE_CONTROLS_MS);
  }

  private hideControls() {
    if (!this.video || this.video.paused) return;
    if (this.stage.querySelector('.seek:active, .controls:hover')) {
      this.showControls(true);
      return;
    }
    this.stage.classList.remove('controls-on');
  }

  private toggleFullscreen() {
    const doc = document as FullscreenDoc;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      if (doc.exitFullscreen) void doc.exitFullscreen().catch(() => {});
      else doc.webkitExitFullscreen?.();
      return;
    }
    const el = this.stage as FullscreenEl;
    if (el.requestFullscreen) void el.requestFullscreen().catch(() => this.nativeFullscreen());
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else this.nativeFullscreen();
  }

  /** iPhone Safari can only fullscreen the <video> itself (with iOS's own controls). */
  private nativeFullscreen() {
    (this.video as IOSVideo | null)?.webkitEnterFullscreen?.();
  }

  private onKey(e: KeyboardEvent) {
    if (!this.isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault(); // so the details page underneath doesn't also close
      return this.close();
    }
    const v = this.video;
    if (!v || (e.target as HTMLElement | null)?.closest?.('button')) return;
    const keys: Record<string, () => void> = {
      ' ': () => (v.paused ? void v.play().catch(() => {}) : v.pause()),
      k: () => (v.paused ? void v.play().catch(() => {}) : v.pause()),
      ArrowRight: () => (v.currentTime = Math.min(v.duration || 0, v.currentTime + 5)),
      ArrowLeft: () => (v.currentTime = Math.max(0, v.currentTime - 5)),
      m: () => (v.muted = !v.muted),
      f: () => this.toggleFullscreen(),
    };
    const action = keys[e.key];
    if (!action) return;
    // Let the focused seek bar handle its own arrow keys.
    if (e.key.startsWith('Arrow') && (e.target as HTMLElement | null)?.classList?.contains('seek')) return;
    e.preventDefault();
    action();
    this.showControls(true);
  }

  private showError(message: string) {
    this.teardown();
    const el = document.createElement('div');
    el.className = 'player__error';
    el.textContent = message;
    this.stage.append(el);
  }

  private teardown() {
    clearTimeout(this.hideTimer);
    this.session?.abort();
    this.session = null;
    this.hls?.destroy();
    this.hls = null;
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.video = null;
    }
    this.stage.classList.remove('controls-on', 'is-paused');
    this.stage.replaceChildren();
  }
}
