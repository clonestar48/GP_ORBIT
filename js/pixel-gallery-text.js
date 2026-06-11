/**
 * Line-mask + fade text reveals (Codrops demo parity, no Club SplitText).
 * Ref: J0SUKE/gsap-threejs-codrops text-animation.ts
 */

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;

function parseAttr(el, name, fallback) {
  return parseFloat(el.getAttribute(name) || String(fallback));
}

/** Split on <br> for titles. */
function splitBrLines(element) {
  const html = element.dataset.textOriginal || element.innerHTML;
  const parts = html.split(/<br\s*\/?>/i).map((s) => s.replace(/<[^>]+>/g, '').trim());
  element.innerHTML = '';
  const lines = [];
  parts.forEach((text) => {
    if (!text) return;
    const mask = document.createElement('div');
    mask.className = 'pg-line-mask';
    const line = document.createElement('div');
    line.className = 'pg-line';
    line.textContent = text;
    mask.appendChild(line);
    element.appendChild(mask);
    lines.push(line);
  });
  return lines;
}

/** Auto-detect wrapped lines (body copy). */
function splitWrappedLines(element) {
  const text = (element.dataset.textOriginal || element.textContent).trim();
  const words = text.split(/\s+/).filter(Boolean);
  element.innerHTML = words
    .map((word) => `<span class="pg-split-word">${word}</span>`)
    .join(' ');

  const groups = [];
  let group = [];
  let lastTop = null;
  element.querySelectorAll('.pg-split-word').forEach((span) => {
    const top = span.offsetTop;
    if (lastTop !== null && top > lastTop + 2) {
      groups.push(group);
      group = [];
    }
    group.push(span.textContent);
    lastTop = top;
  });
  if (group.length) groups.push(group);

  element.innerHTML = '';
  const lines = [];
  groups.forEach((lineWords) => {
    const mask = document.createElement('div');
    mask.className = 'pg-line-mask';
    const line = document.createElement('div');
    line.className = 'pg-line';
    line.textContent = lineWords.join(' ');
    mask.appendChild(line);
    element.appendChild(mask);
    lines.push(line);
  });
  return lines;
}

function storeOriginal(el) {
  if (!el.dataset.textOriginal) {
    el.dataset.textOriginal = el.innerHTML.trim();
  }
  el.innerHTML = el.dataset.textOriginal;
}

export class TextAnimation {
  constructor() {
    this.ready = false;
    this.splitAnimations = [];
    this.fadeAnimations = [];
    this.splitTweens = [];
    this.fadeTweens = [];
  }

  init() {
    if (!gsap || !ScrollTrigger) return;

    this.destroy();
    this.ready = true;
    this.splitAnimations = [];
    this.fadeAnimations = [];

    document.querySelectorAll('[data-text-animation]').forEach((el) => {
      const inDuration = parseAttr(el, 'data-text-animation-in-duration', 0.6);
      const outDuration = parseAttr(el, 'data-text-animation-out-duration', 0.3);
      const inDelay = parseAttr(el, 'data-text-animation-in-delay', 0);

      if (el.hasAttribute('data-text-animation-split')) {
        storeOriginal(el);
        const lines = /<br\s*\/?>/i.test(el.dataset.textOriginal)
          ? splitBrLines(el)
          : splitWrappedLines(el);

        const inStagger = parseAttr(el, 'data-text-animation-in-stagger', 0.06);
        const outStagger = parseAttr(el, 'data-text-animation-out-stagger', 0.06);

        gsap.set(lines, { yPercent: 100 });
        gsap.set(el, { autoAlpha: 1, visibility: 'visible' });

        this.splitAnimations.push({
          element: el,
          lines,
          inDuration,
          outDuration,
          inStagger,
          outStagger,
          inDelay,
        });
      } else {
        gsap.set(el, { autoAlpha: 0, visibility: 'hidden' });
        this.fadeAnimations.push({
          element: el,
          inDuration,
          outDuration,
          inDelay,
        });
      }
    });
  }

  animateIn({ delay = 0 } = {}) {
    if (!this.ready || !gsap || !ScrollTrigger) return null;

    this.splitAnimations.forEach(
      ({ element, lines, inDuration, inStagger, inDelay }) => {
        const tween = gsap.to(lines, {
          yPercent: 0,
          stagger: inStagger,
          ease: 'expo.out',
          duration: inDuration,
          delay: inDelay + delay,
          scrollTrigger: {
            trigger: element,
            start: 'top bottom',
            end: 'bottom top',
            toggleActions: 'play reset restart reset',
          },
        });
        this.splitTweens.push(tween);
      },
    );

    this.fadeAnimations.forEach(({ element, inDuration, inDelay }) => {
      const tween = gsap.to(element, {
        autoAlpha: 1,
        visibility: 'visible',
        ease: 'power2.out',
        duration: inDuration,
        delay: inDelay + delay,
        scrollTrigger: {
          trigger: element,
          start: 'top bottom',
          end: 'bottom top',
          toggleActions: 'play reset restart reset',
        },
      });
      this.fadeTweens.push(tween);
    });

    ScrollTrigger.refresh();
    return gsap.timeline();
  }

  onResize() {
    if (!this.ready) return;
    this.init();
    this.animateIn();
  }

  destroy() {
    this.splitTweens.forEach((tween) => {
      tween.scrollTrigger?.kill();
      tween.kill();
    });
    this.fadeTweens.forEach((tween) => {
      tween.scrollTrigger?.kill();
      tween.kill();
    });
    this.splitTweens = [];
    this.fadeTweens = [];

    document.querySelectorAll('[data-text-animation][data-text-original]').forEach((el) => {
      el.innerHTML = el.dataset.textOriginal;
    });

    this.splitAnimations = [];
    this.fadeAnimations = [];
    this.ready = false;
  }
}

export async function loadSatoshiFont() {
  if (!document.fonts) return;
  try {
    await document.fonts.load('400 16px Satoshi');
    await document.fonts.load('500 16px Satoshi');
  } catch {
    /* font-display: swap will still apply */
  }
}
