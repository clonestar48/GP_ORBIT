/**
 * Portfolio content - one entry per SECTIONS key in main.js.
 */

const SITE = 'https://gavinpetersen.co';

/** WORK top-nav dropdown entries */
export const WORK_MENU = [
  {
    title: 'PORTFOLIO HOME',
    href: `${SITE}/`,
    desc: 'GAVINPETERSEN.CO',
  },
  {
    title: 'GRAPHIC DESIGN',
    href: `${SITE}/`,
    desc: 'BRANDING · IDENTITY · CAMPAIGNS',
  },
  {
    title: 'ILLUSTRATION',
    href: `${SITE}/`,
    desc: 'EDITORIAL · CHARACTER · PRINT',
  },
  {
    title: 'VIEW ALL WORK',
    href: `${SITE}/`,
    desc: 'FULL PROJECT INDEX',
  },
];

export const CONTENT = {
  work: {
    title: 'WORK',
    html: `
      <p class="lcd__line">Selected graphic design, branding, and illustration.</p>
      <div class="lcd__entry lcd__line">
        <div class="lcd__entry-title"><a href="${SITE}/" target="_blank" rel="noopener">GAVIN PETERSEN</a></div>
        <div class="lcd__entry-desc">Portfolio home · gavinpetersen.co</div>
      </div>
    `,
  },
  nfl: {
    title: 'NFL',
    html: `
      <p class="lcd__line">Senior designer - NFL brand & campaign work.</p>
      <div class="lcd__entry lcd__line">
        <div class="lcd__entry-title"><a href="${SITE}/nfl" target="_blank" rel="noopener">VIEW NFL WORK</a></div>
        <div class="lcd__entry-desc">gavinpetersen.co/nfl</div>
      </div>
      <div class="lcd__entry lcd__line">
        <div class="lcd__entry-title">SUPER BOWL LIX</div>
      </div>
      <div class="lcd__entry lcd__line">
        <div class="lcd__entry-title">SUPER BOWL LVII</div>
      </div>
      <div class="lcd__entry lcd__line">
        <div class="lcd__entry-title">NFL DRAFT 2022</div>
      </div>
      <div class="lcd__entry lcd__line">
        <div class="lcd__entry-title">NFL LONDON GAMES 2021</div>
      </div>
      <div class="lcd__entry lcd__line">
        <div class="lcd__entry-title">NFL FRANKFURT GAMES 2023</div>
      </div>
    `,
  },
  portraits: {
    title: 'PORTRAITS',
    html: `
      <p class="lcd__line">Portrait & editorial illustration.</p>
      <div class="lcd__entry lcd__line">
        <div class="lcd__entry-title"><a href="${SITE}/portraits" target="_blank" rel="noopener">VIEW PORTRAITS</a></div>
        <div class="lcd__entry-desc">gavinpetersen.co/portraits</div>
      </div>
      <div class="lcd__entry lcd__line">
        <div class="lcd__entry-title">JAYLEN BROWN</div>
      </div>
      <div class="lcd__entry lcd__line">
        <div class="lcd__entry-title">YOUNG NUDY</div>
      </div>
      <div class="lcd__entry lcd__line">
        <div class="lcd__entry-title">KHABIB NURMAGOMEDOV</div>
      </div>
      <div class="lcd__entry lcd__line">
        <div class="lcd__entry-title">ROBERT WILLIAMS III</div>
      </div>
      <div class="lcd__entry lcd__line">
        <div class="lcd__entry-title">DERRICK LEWIS</div>
      </div>
    `,
  },
  about: {
    title: 'ABOUT',
    html: `
      <p class="lcd__line">Artist & designer based in Brooklyn, NY.</p>
      <p class="lcd__line">Over 10 years of experience in graphic design, branding, and illustration. Currently working for the NFL as a senior designer.</p>
      <p class="lcd__line">Fan of traveling, dogs, & the Boston Celtics.</p>
      <div class="lcd__entry lcd__line">
        <div class="lcd__entry-title"><a href="${SITE}/about" target="_blank" rel="noopener">FULL BIO</a></div>
        <div class="lcd__entry-desc">gavinpetersen.co/about</div>
      </div>
    `,
  },
};
