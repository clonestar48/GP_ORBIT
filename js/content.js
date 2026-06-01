/**
 * Portfolio content - one entry per SECTIONS key in main.js.
 * Blocks marked CONTENT PENDING need owner-approved copy and links.
 */

const SITE = 'https://gavinpetersen.co';

export const CONTACT_EMAIL = 'gavin@gavinpetersen.co';

const PENDING_DESC = 'Awaiting approved copy and links.';

function pendingEntry() {
  return `
      <div class="lcd__entry lcd__line">
        <div class="lcd__entry-title">CONTENT PENDING</div>
        <div class="lcd__entry-desc">${PENDING_DESC}</div>
      </div>`;
}

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
  lab: {
    title: 'LAB',
    html: `
      <p class="lcd__line">Experimental and prototype work.</p>
      ${pendingEntry()}
    `,
  },
  about: {
    title: 'ABOUT',
    html: `
      <p class="lcd__line">Codec / intercom view (not file panel).</p>
      ${pendingEntry()}
    `,
  },
  contact: {
    title: 'CONTACT',
    html: `
      <div class="contact-comms">
        <p class="lcd__line contact-comms__status">CHANNEL OPEN</p>
        <p class="lcd__line contact-comms__note">Direct transmission available. No form. No ticket system.</p>
        <div class="lcd__line contact-comms__signal">
          <span class="contact-comms__label">DIRECT SIGNAL</span>
          <a class="contact-comms__email" href="mailto:${CONTACT_EMAIL}" data-contact-email>${CONTACT_EMAIL}</a>
        </div>
        <p class="lcd__line contact-comms__aside">Paperwork optional. Signal preferred.</p>
        <div class="lcd__line contact-comms__actions">
          <button type="button" class="contact-comms__btn" data-contact-copy>COPY ADDRESS</button>
          <a class="contact-comms__btn contact-comms__btn--link" href="mailto:${CONTACT_EMAIL}">OPEN MAIL CLIENT</a>
        </div>
        <p class="lcd__line contact-comms__feedback" data-contact-feedback aria-live="polite"></p>
      </div>
    `,
  },
};

/** Wire copy button after CONTACT panel is injected (called from main.js only). */
export function initContactPanel(root) {
  if (!root) return;

  const copyBtn = root.querySelector('[data-contact-copy]');
  const feedback = root.querySelector('[data-contact-feedback]');
  if (!copyBtn) return;

  copyBtn.addEventListener('click', async () => {
    const text = CONTACT_EMAIL;
    let ok = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      }
    } catch {
      ok = false;
    }

    if (feedback) {
      feedback.textContent = ok ? 'SIGNAL COPIED TO BUFFER' : 'COPY FAILED — USE LINK OR SELECT ADDRESS';
      window.setTimeout(() => {
        feedback.textContent = '';
      }, 2400);
    }
  });
}
