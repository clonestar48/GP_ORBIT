/**
 * Horizontal smooth scroll + parallax (DOM).
 * Technique reference: davidfaure/horizontal-parallax-gallery-codrops
 */

function lerp(start, end, factor) {
  return start * (1 - factor) + end * factor;
}

function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value));
}

class HorizontalGallery {
  constructor(root) {
    this.root = root;
    this.wrapper = root.querySelector('[data-gallery-wrapper]');
    this.track = root.querySelector('[data-gallery-track]');
    this.images = root.querySelectorAll('[data-gallery-image]');
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.scroll = {
      current: 0,
      target: 0,
      ease: 0.07,
      limit: 0,
    };

    this.parallaxMax = this.reducedMotion ? 0 : 10;

    this.onWheel = this.onWheel.bind(this);
    this.onResize = this.onResize.bind(this);
    this.render = this.render.bind(this);

    this.preload().then(() => {
      document.body.classList.remove('gallery-loading');
      this.setLimit();
      this.addListeners();
      this.render();
    });
  }

  preload() {
    const urls = [...this.images].map((img) => img.src);
    return Promise.all(
      urls.map(
        (src) =>
          new Promise((resolve) => {
            const image = new Image();
            image.onload = resolve;
            image.onerror = resolve;
            image.src = src;
          }),
      ),
    );
  }

  setLimit() {
    if (!this.track || !this.wrapper) return;
    this.scroll.limit = Math.max(0, this.track.scrollWidth - this.wrapper.clientWidth);
  }

  onWheel(e) {
    if (!this.track) return;
    this.scroll.target += e.deltaY;
  }

  onResize() {
    this.setLimit();
  }

  addListeners() {
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('resize', this.onResize, { passive: true });
  }

  applyParallax() {
    if (this.parallaxMax <= 0) return;

    const viewportCenter = window.innerWidth * 0.5;

    this.images.forEach((image) => {
      const frame = image.parentElement;
      if (!frame) return;

      const rect = frame.getBoundingClientRect();
      const elementCenter = rect.left + rect.width * 0.5;
      const t = clamp((elementCenter - viewportCenter) / viewportCenter, -1, 1);
      const shift = -t * this.parallaxMax;
      image.style.transform = `translate3d(${shift}%, 0, 0)`;
    });
  }

  render() {
    this.scroll.target = clamp(0, this.scroll.limit, this.scroll.target);
    this.scroll.current = lerp(this.scroll.current, this.scroll.target, this.scroll.ease);

    if (this.track) {
      const x = this.scroll.current < 0.01 ? 0 : -this.scroll.current;
      this.track.style.transform = `translate3d(${x}px, 0, 0)`;
    }

    this.applyParallax();
    requestAnimationFrame(this.render);
  }
}

const root = document.querySelector('[data-horizontal-gallery]');
if (root) {
  new HorizontalGallery(root);
}
