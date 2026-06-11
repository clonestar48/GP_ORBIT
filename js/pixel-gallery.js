/**
 * Scroll-revealed WebGL pixel gallery.
 * Technique reference: J0SUKE/gsap-threejs-codrops
 */

import * as THREE from '../assets/vendor/three.module.js';
import { vertexShader, fragmentShader } from './pixel-gallery-shaders.js';
import { TextAnimation, loadSatoshiFont } from './pixel-gallery-text.js';

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;

if (gsap && ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);
}

const BG_DEEP_HEX = 0x080a0e;

function getRevealColor() {
  const hex = getComputedStyle(document.documentElement)
    .getPropertyValue('--bg-deep')
    .trim();
  const color = new THREE.Color(hex || BG_DEEP_HEX);
  if (!hex || color.r + color.g + color.b < 0.001) {
    color.setHex(BG_DEEP_HEX);
  }
  return color;
}
const REVEAL_DURATION = 1.6;

function makePlaceholderTexture(color) {
  const c = color || getRevealColor();
  const data = new Uint8Array([
    Math.round(c.r * 255),
    Math.round(c.g * 255),
    Math.round(c.b * 255),
    255,
  ]);
  const tex = new THREE.DataTexture(data, 1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function waitForLayout() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function refreshScrollTriggers() {
  ScrollTrigger?.refresh();
}

class Media {
  constructor({ element, scene, sizes, onSelect }) {
    this.element = element;
    this.anchor = element.closest('[data-pixel-link]');
    this.triggerEl = this.element;
    this.scene = scene;
    this.sizes = sizes;
    this.onSelect = onSelect;
    this.revealTween = null;

    const nw = this.element.naturalWidth || this.element.width || 1;
    const nh = this.element.naturalHeight || this.element.height || 1;

    const revealColor = getRevealColor();
    this.geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: false,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTexture: { value: makePlaceholderTexture(revealColor) },
        uResolution: { value: new THREE.Vector2(nw, nh) },
        uContainerRes: { value: new THREE.Vector2(1, 1) },
        uProgress: { value: 0 },
        uGridSize: { value: 20 },
        uColor: { value: revealColor },
      },
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this.onClick = this.onClick.bind(this);
    this.anchor?.addEventListener('click', this.onClick);

    this.loadTexture();
    this.observe();
  }

  onClick(e) {
    e.preventDefault();
    this.onSelect?.({
      src: this.element.currentSrc || this.element.src,
      title: this.anchor?.dataset.pixelTitle || '',
      meta: this.anchor?.dataset.pixelMeta || '',
    });
  }

  loadTexture() {
    const loader = new THREE.TextureLoader();
    const src = this.element.currentSrc || this.element.src;

    loader.load(
      src,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        this.material.uniforms.uTexture.value = texture;
        const img = texture.image;
        if (img?.naturalWidth) {
          this.material.uniforms.uResolution.value.set(img.naturalWidth, img.naturalHeight);
        }
        this.syncLayout();
        refreshScrollTriggers();
      },
      undefined,
      (err) => {
        console.warn('[pixel-gallery] texture failed:', src, err);
      },
    );
  }

  syncLayout() {
    const rect = this.triggerEl.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    const w = (rect.width * this.sizes.width) / window.innerWidth;
    const h = (rect.height * this.sizes.height) / window.innerHeight;
    this.mesh.scale.set(w, h, 1);

    let x = (rect.left * this.sizes.width) / window.innerWidth;
    let y = (-rect.top * this.sizes.height) / window.innerHeight;
    x -= this.sizes.width / 2;
    x += w / 2;
    y -= h / 2;
    y += this.sizes.height / 2;

    this.mesh.position.set(x, y, 0);
    this.material.uniforms.uContainerRes.value.set(rect.width, rect.height);
  }

  /** Demo-style: play reveal on enter, reset on leave (not scroll-frozen at 50%). */
  observe() {
    if (!gsap || !ScrollTrigger) return;

    this.revealTween?.scrollTrigger?.kill();
    this.revealTween?.kill();

    gsap.set(this.material.uniforms.uProgress, { value: 0 });

    this.revealTween = gsap.to(this.material.uniforms.uProgress, {
      value: 1,
      duration: REVEAL_DURATION,
      ease: 'none',
      scrollTrigger: {
        trigger: this.triggerEl,
        start: 'top bottom',
        end: 'bottom top',
        toggleActions: 'play reset restart reset',
        invalidateOnRefresh: true,
      },
    });
  }

  onResize(sizes) {
    this.sizes = sizes;
    this.syncLayout();
    this.revealTween?.scrollTrigger?.refresh();
  }

  destroy() {
    this.anchor?.removeEventListener('click', this.onClick);
    this.revealTween?.scrollTrigger?.kill();
    this.revealTween?.kill();
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}

class Canvas {
  constructor(canvasEl) {
    this.element = canvasEl;
    this.medias = [];
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.camera.position.z = 10;
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.element,
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setClearColor(BG_DEEP_HEX, 1);
    this.setSizes();
    this.resize();
  }

  setSizes() {
    const fov = this.camera.fov * (Math.PI / 180);
    const height = this.camera.position.z * Math.tan(fov / 2) * 2;
    const width = height * this.camera.aspect;
    this.sizes = { width, height };
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.setSizes();
    this.medias.forEach((m) => m.onResize(this.sizes));
  }

  createMedias(onSelect) {
    document.querySelectorAll('[data-pixel-image]').forEach((img) => {
      this.medias.push(
        new Media({
          element: img,
          scene: this.scene,
          sizes: this.sizes,
          onSelect,
        }),
      );
    });
  }

  render() {
    this.medias.forEach((m) => m.syncLayout());
    this.renderer.render(this.scene, this.camera);
  }
}

function clearLoading() {
  document.body.classList.remove('pg-loading');
}

function activateWebGL() {
  document.body.classList.add('pg-webgl');
}

function preloadImages(timeoutMs = 10000) {
  const images = [...document.querySelectorAll('[data-pixel-image]')];
  images.forEach((img) => {
    img.loading = 'eager';
  });

  const perImage = (img) =>
    new Promise((resolve) => {
      const done = () => resolve();
      if (img.complete && img.naturalWidth > 0) done();
      else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      }
    });

  return Promise.race([
    Promise.all(images.map(perImage)),
    new Promise((r) => window.setTimeout(r, timeoutMs)),
  ]);
}

function initDetail() {
  const detail = document.getElementById('pg-detail');
  const img = document.getElementById('pg-detail-img');
  const titleEl = document.getElementById('pg-detail-title');
  const metaEl = document.getElementById('pg-detail-meta');
  const closeBtn = document.getElementById('pg-detail-close');

  const open = ({ src, title, meta }) => {
    img.src = src;
    titleEl.textContent = title;
    metaEl.textContent = meta;
    detail.classList.add('pg-detail--open');
    detail.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (gsap) {
      gsap.fromTo(detail, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power2.out' });
    } else {
      detail.style.opacity = '1';
    }
  };

  const close = () => {
    const done = () => {
      detail.classList.remove('pg-detail--open');
      detail.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      detail.style.opacity = '';
    };
    if (gsap) {
      gsap.to(detail, {
        opacity: 0,
        duration: 0.28,
        ease: 'power2.in',
        onComplete: done,
      });
    } else {
      done();
    }
  };

  closeBtn?.addEventListener('click', close);
  detail?.addEventListener('click', (e) => {
    if (e.target === detail) close();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  return { open };
}

let textAnimation = null;

async function init() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.body.classList.add('pg-text-static');
    clearLoading();
    return;
  }

  if (!gsap || !ScrollTrigger) {
    console.warn('[pixel-gallery] GSAP / ScrollTrigger required for reveal');
    document.body.classList.add('pg-fallback');
    clearLoading();
    return;
  }

  const canvasEl = document.getElementById('pg-webgl');
  if (!canvasEl) {
    clearLoading();
    return;
  }

  try {
    await preloadImages();
    await waitForLayout();
    await loadSatoshiFont();

    const detail = initDetail();
    const canvas = new Canvas(canvasEl);
    canvas.createMedias((item) => detail.open(item));
    activateWebGL();

    textAnimation = new TextAnimation();
    textAnimation.init();
    textAnimation.animateIn({ delay: 0.3 });

    const tick = () => {
      canvas.render();
      requestAnimationFrame(tick);
    };
    tick();

    const onLayoutChange = () => {
      canvas.resize();
      refreshScrollTriggers();
      textAnimation?.onResize();
    };

    window.addEventListener('resize', onLayoutChange);
    window.addEventListener('load', onLayoutChange);
    requestAnimationFrame(refreshScrollTriggers);
    window.setTimeout(refreshScrollTriggers, 300);
    window.setTimeout(refreshScrollTriggers, 1200);
  } catch (err) {
    console.error('[pixel-gallery]', err);
    document.body.classList.remove('pg-webgl');
    document.body.classList.add('pg-fallback');
  }

  clearLoading();
}

init().catch((err) => {
  console.error('[pixel-gallery]', err);
  document.body.classList.remove('pg-webgl');
  document.body.classList.add('pg-fallback');
  clearLoading();
});
