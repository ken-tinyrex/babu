/**
 * On touch devices the browser fires a synthetic `click` ~after the canvas has already
 * handled the tap. When that tap opens an overlay, the click lands on whatever the
 * overlay put under the finger (e.g. the details page's Play button).
 * Call this when opening an overlay to swallow clicks for a short moment.
 */
let until = 0;

document.addEventListener(
  'click',
  (e) => {
    if (performance.now() < until) {
      e.stopPropagation();
      e.preventDefault();
    }
  },
  true,
);

export function suppressGhostClicks(ms = 400) {
  until = performance.now() + ms;
}
