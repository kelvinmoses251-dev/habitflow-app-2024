// landing.js: the landing page below the demo (roadmap batch 7).
//
// Feature sections play a small demonstration once, the first time they are scrolled into view. That is an
// enhancement: the hidden starting states in style.css apply only under `.js-reveal`, which this file adds, so
// with no script (or no IntersectionObserver, or reduced motion) every section is simply shown in its final state.
// Nothing here touches Firebase or a signed-in account.

const more = document.getElementById('landing-more');
if (more) init();

function init() {
  // The year grid of the third feature: a fixed, plausible pattern (it is an illustration, not anyone's data).
  const heat = more.querySelector('.f-heat');
  if (heat && !heat.childElementCount) {
    const cols = 18, cells = [];
    for (let c = 0; c < cols; c++) for (let r = 0; r < 7; r++) {
      const level = (c * 7 + r * 3 + (c % 4) * r) % 9;          // 0..8, spread without a visible stripe
      cells.push(`<i class="l-${level < 2 ? 0 : level < 4 ? 1 : level < 6 ? 2 : level < 8 ? 3 : 4}" style="--i:${c}"></i>`);
    }
    heat.innerHTML = cells.join('');
  }

  const features = [...more.querySelectorAll('.feature')];
  const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (calm || !('IntersectionObserver' in window)) { features.forEach(f => f.classList.add('is-in')); return; }
  more.classList.add('js-reveal');
  const seen = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); seen.unobserve(e.target); } });
  }, { threshold: 0.45 });
  features.forEach(f => seen.observe(f));
}
