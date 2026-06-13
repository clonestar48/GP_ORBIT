/** Custom team picker — replaces native selects in hero controls. */

let openPicker = null;

document.addEventListener('click', (e) => {
  if (openPicker && !openPicker.root.contains(e.target)) openPicker.close();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openPicker) {
    openPicker.close();
    openPicker.trigger?.focus();
  }
});

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function teamLabel(team) {
  if (!team) return 'Select team';
  return `${team.city} ${team.name}`;
}

export class TeamPicker {
  #root;
  #trigger;
  #menu;
  #teams = [];
  #value = '';
  #label;
  #onChange;
  #highlight = -1;

  get root() { return this.#root; }
  get trigger() { return this.#trigger; }

  constructor(root, { teams = [], value = '', label = 'Team', onChange } = {}) {
    this.#root = typeof root === 'string' ? document.querySelector(root) : root;
    if (!this.#root) throw new Error('TeamPicker root not found');
    this.#label = label;
    this.#onChange = onChange;
    this.#teams = teams;
    this.#value = value;
    this.#mount();
    this.setTeams(teams);
    this.setValue(value, { silent: true });
    this.#bind();
  }

  #mount() {
    this.#root.classList.add('sd-team-picker');
    this.#root.innerHTML = `
      <button type="button" class="sd-team-picker__trigger" aria-haspopup="listbox" aria-expanded="false">
        <span class="sd-team-picker__swatch" aria-hidden="true"></span>
        <span class="sd-team-picker__text">
          <span class="sd-team-picker__name">Select team</span>
          <span class="sd-team-picker__abbr"></span>
        </span>
        <span class="sd-team-picker__chevron" aria-hidden="true"></span>
      </button>
      <div class="sd-team-picker__menu" role="listbox" hidden></div>`;
    this.#trigger = this.#root.querySelector('.sd-team-picker__trigger');
    this.#menu = this.#root.querySelector('.sd-team-picker__menu');
    this.#trigger.setAttribute('aria-label', this.#label);
  }

  #bind() {
    this.#trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isOpen ? this.close() : this.open();
    });

    this.#trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!this.isOpen) this.open();
        else this.#moveHighlight(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!this.isOpen) this.open();
        else this.#moveHighlight(-1);
      } else if (e.key === 'Escape') {
        this.close();
      }
    });

    this.#menu.addEventListener('click', (e) => {
      const opt = e.target.closest('[data-team-id]');
      if (!opt) return;
      this.setValue(opt.dataset.teamId);
      this.close();
    });

    this.#menu.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.#moveHighlight(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.#moveHighlight(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const opt = this.#menu.querySelectorAll('[role="option"]')[this.#highlight];
        if (opt) {
          this.setValue(opt.dataset.teamId);
          this.close();
          this.#trigger.focus();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
        this.#trigger.focus();
      }
    });
  }

  get isOpen() {
    return this.#root.classList.contains('is-open');
  }

  open() {
    if (openPicker && openPicker !== this) openPicker.close();
    openPicker = this;
    this.#root.classList.add('is-open');
    this.#trigger.setAttribute('aria-expanded', 'true');
    this.#menu.hidden = false;
    this.#syncHighlight();
    this.#menu.querySelector('[role="option"].is-selected')?.scrollIntoView({ block: 'nearest' });
  }

  close() {
    this.#root.classList.remove('is-open');
    this.#trigger.setAttribute('aria-expanded', 'false');
    this.#menu.hidden = true;
    this.#highlight = -1;
    if (openPicker === this) openPicker = null;
  }

  #moveHighlight(delta) {
    const opts = [...this.#menu.querySelectorAll('[role="option"]')];
    if (!opts.length) return;
    this.#highlight = Math.max(0, Math.min(opts.length - 1, this.#highlight + delta));
    opts.forEach((el, i) => el.classList.toggle('is-highlighted', i === this.#highlight));
    opts[this.#highlight]?.scrollIntoView({ block: 'nearest' });
  }

  #syncHighlight() {
    const opts = [...this.#menu.querySelectorAll('[role="option"]')];
    this.#highlight = Math.max(0, opts.findIndex((el) => el.dataset.teamId === this.#value));
    opts.forEach((el, i) => el.classList.toggle('is-highlighted', i === this.#highlight));
  }

  setTeams(teams) {
    this.#teams = teams || [];
    this.#menu.innerHTML = this.#teams.map((t) => `
      <button type="button" class="sd-team-picker__option" role="option"
        data-team-id="${esc(t.id)}" aria-selected="false">
        <span class="sd-team-picker__swatch" style="background:${esc(t.colors?.primary || '#5da396')}"></span>
        <span class="sd-team-picker__option-name">${esc(t.city)} ${esc(t.name)}</span>
        <span class="sd-team-picker__option-abbr">${esc(t.abbreviation)}</span>
      </button>`).join('');
    this.setValue(this.#value, { silent: true });
  }

  setValue(teamId, { silent = false } = {}) {
    this.#value = teamId || '';
    const team = this.#teams.find((t) => t.id === teamId);
    const swatch = this.#trigger.querySelector('.sd-team-picker__swatch');
    const nameEl = this.#trigger.querySelector('.sd-team-picker__name');
    const abbrEl = this.#trigger.querySelector('.sd-team-picker__abbr');

    if (team) {
      swatch.style.background = team.colors?.primary || '#5da396';
      nameEl.textContent = teamLabel(team);
      abbrEl.textContent = team.abbreviation;
      this.#trigger.classList.remove('is-placeholder');
    } else {
      swatch.style.background = 'rgba(var(--teal-rgb), 0.25)';
      nameEl.textContent = 'Select team';
      abbrEl.textContent = '';
      this.#trigger.classList.add('is-placeholder');
    }

    this.#menu.querySelectorAll('[role="option"]').forEach((el) => {
      const selected = el.dataset.teamId === teamId;
      el.classList.toggle('is-selected', selected);
      el.setAttribute('aria-selected', selected ? 'true' : 'false');
    });

    if (!silent && teamId && this.#onChange) this.#onChange(teamId);
  }

  getValue() {
    return this.#value;
  }
}
