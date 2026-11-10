import type { Title } from '../data/types';
import { enrichTitle } from '../data/movieInfo';
import { suppressGhostClicks } from '../ghostClick';

/** Tiny element helper; text is always set via textContent (API data is untrusted). */
function h<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

const cssUrl = (url: string) => `url(${JSON.stringify(url)})`;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

/**
 * Movie details page: a full-screen DOM sheet over the Pixi canvas
 * (long text, native scrolling and accessibility are easier in the DOM).
 */
export class Details {
  onPlay?: (title: Title) => void;
  onOpen?: () => void;
  onClose?: () => void;

  private root = h('div', 'details');
  private token = 0;

  constructor() {
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'details-title');
    document.body.appendChild(this.root);

    window.addEventListener('keydown', (e) => {
      // The player (above us) handles Escape first and marks it handled.
      if (e.key === 'Escape' && this.isOpen && !e.defaultPrevented) this.close();
    });
  }

  get isOpen() {
    return !this.root.hidden;
  }

  async open(title: Title) {
    const token = ++this.token;
    suppressGhostClicks();
    this.render(title);
    if (!this.isOpen) {
      this.root.hidden = false;
      this.onOpen?.();
    }
    this.root.scrollTop = 0;
    this.root.querySelector<HTMLButtonElement>('.details__play')?.focus({ preventScroll: true });

    // Usually instant (enriched at startup); re-render if new data arrives.
    await enrichTitle(title);
    if (token === this.token && this.isOpen) this.render(title);
  }

  close() {
    if (!this.isOpen) return;
    this.token++;
    this.root.hidden = true;
    this.root.replaceChildren();
    this.onClose?.();
  }

  private render(t: Title) {
    const m = t.meta ?? {};
    const scrollTop = this.root.scrollTop;

    const close = h('button', 'details__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close details');
    close.addEventListener('click', () => this.close());

    // Backdrop: landscape art if we have it, else a blurred poster, else the title color.
    const hero = h('div', 'details__hero');
    hero.style.setProperty('--tint', `#${t.color.toString(16).padStart(6, '0')}`);
    const art = t.backdrop ?? t.poster;
    if (art) {
      const bg = h('div', `details__backdrop${t.backdrop ? '' : ' is-blurred'}`);
      bg.style.backgroundImage = cssUrl(art);
      hero.append(bg);
    }

    const body = h('div', 'details__body');

    const posterBox = h('div', 'details__poster');
    posterBox.style.setProperty('--tint', `#${t.color.toString(16).padStart(6, '0')}`);
    if (t.poster) {
      const img = h('img');
      img.src = t.poster;
      img.alt = `${t.name} poster`;
      img.decoding = 'async';
      posterBox.append(img);
    } else {
      posterBox.append(h('span', 'details__poster-initial', t.name.charAt(0)));
    }

    const main = h('div', 'details__main');
    const title = h('h1', 'details__title', t.name);
    title.id = 'details-title';

    const metaLine = h('div', 'details__meta');
    const bits = [t.year ? String(t.year) : '', m.certification ?? '', t.duration ?? ''].filter(Boolean);
    bits.forEach((b, i) => {
      if (i) metaLine.append(h('span', 'details__dot', '•'));
      metaLine.append(h('span', m.certification === b ? 'details__cert' : '', b));
    });
    if (m.score) {
      metaLine.append(h('span', 'details__dot', '•'));
      metaLine.append(h('span', 'details__score', `★ ${m.score.toFixed(1)}`));
    }

    const genres = h('div', 'details__genres');
    for (const g of m.genres ?? []) genres.append(h('span', 'chip', g));

    const actions = h('div', 'details__actions');
    const play = h('button', 'btn btn--primary details__play', '▶  Play');
    play.type = 'button';
    play.addEventListener('click', () => this.onPlay?.(t));
    actions.append(play);

    main.append(title, metaLine);
    if (m.genres?.length) main.append(genres);
    if (m.tagline) main.append(h('p', 'details__tagline', m.tagline));
    main.append(actions, h('p', 'details__overview', t.description));

    const facts = [
      ...(m.director ? [{ label: 'Director', value: m.director }] : []),
      ...(m.facts ?? []),
    ].filter((f, i, all) => all.findIndex((x) => x.label === f.label) === i);
    if (facts.length) {
      const dl = h('dl', 'details__facts');
      for (const f of facts) dl.append(h('dt', '', f.label), h('dd', '', f.value));
      main.append(dl);
    }

    body.append(posterBox, main);

    const sections: HTMLElement[] = [];

    if (m.cast?.length) {
      const sec = h('section', 'details__section');
      sec.append(h('h2', '', 'Cast'));
      const list = h('ul', 'details__cast');
      for (const c of m.cast) {
        const li = h('li', 'cast');
        const face = h('div', 'cast__face');
        if (c.photo) {
          const img = h('img');
          img.src = c.photo;
          img.alt = '';
          img.loading = 'lazy';
          face.append(img);
        } else {
          face.textContent = initials(c.name);
        }
        li.append(face, h('div', 'cast__name', c.name));
        if (c.character) li.append(h('div', 'cast__role', c.character));
        list.append(li);
      }
      sec.append(list);
      sections.push(sec);
    }

    if (m.about) {
      const sec = h('section', 'details__section');
      sec.append(h('h2', '', 'About the film'), h('p', 'details__about', m.about));
      if (m.aboutUrl) {
        const a = h('a', 'details__link', 'Read more on Wikipedia →');
        a.href = m.aboutUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        sec.append(a);
      }
      sections.push(sec);
    }

    const credit = h('footer', 'details__credit');
    if (m.source === 'tmdb') {
      credit.textContent = 'Movie data and images from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.';
    } else if (m.source === 'wikipedia') {
      credit.textContent = 'Synopsis and poster from Wikipedia (text CC BY-SA 4.0).';
    }

    this.root.replaceChildren(close, hero, body, ...sections, credit);
    this.root.scrollTop = scrollTop;
  }
}
