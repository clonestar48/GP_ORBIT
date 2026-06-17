# Sine Lab — Project Notes

## What this is

Self-contained procedural melody toy inside GP Orbit. Users pick a **World** (sound + composition style), shape tone with macros/knobs, paint notes on a step grid, and play loops. Hand-built melodies get random two-word titles in the Now Playing card.

**Branch:** `feature/sine-lab-polish`  
**Scope:** Everything lives in `/sine` only.

---

## How to run

From repo root:

```bash
python3 serve.py
```

Open: **http://127.0.0.1:8120/sine/**

Production: `vercel.json` serves `sine/**` statically; `/sine` → `sine/index.html`.

Entry: `index.html` → `ui.js` (ES module). Use `127.0.0.1`, not `file://`.

---

## File map

| File | Responsibility |
|------|----------------|
| `index.html` | Page shell, DOM hooks, layout regions |
| `ui.js` | Boot, knobs/macros, URL state, artifact card, world selection, shuffle/mutate |
| `synth.js` | Web Audio one-shot `play()`, loop helpers, `unlock()` |
| `melody.js` | Step sequencer, grid render, transport, paint mode, loop default |
| `generate.js` | 8 worlds, procedural melodies/patches, mutate, `generateCustomTitle()` |
| `world-radar.js` | Mission-select radar UI (8 nodes, retro map-marker icons) |
| `style.css` | All styling (no shared Orbit CSS) |

**Module graph:** `ui.js` → `synth.js`, `melody.js`, `generate.js`, `world-radar.js`  
`melody.js` → `synth.js`

---

## Current interaction features

- **Worlds flyout** — oval radar picker; 8 featured worlds (Space Age, Arcade, Dungeon, Bubble, Beach, Desert, Ice Cave, Speedway)
- **Sound macros** — Brightness, Texture, Energy, Space → underlying synth params
- **Advanced Sound** — tone rotaries + shape sliders
- **Melody grid** — 8–32 steps, 8 pitch rows (C5–C4); click-and-drag paint (any direction); single tap clears a lit cell
- **Live editing** — grid edits work during playback; incremental column updates (no full grid rebuild per click)
- **Loop** — on by default; Clear restores loop on
- **Now Playing** — world songs show seed/title; custom/hand-built melodies get generated title + World: Custom
- **URL sharing** — `seed`, `world`, `rv`, `mi`, synth params, `mel=` pattern encoding
- **Actions** — Shuffle, Remix (note shuffle), Mutate (intensity tiers), Copy link; Space toggles play when focus not on controls

---

## Do not touch

| Out of scope | Reason |
|--------------|--------|
| `odds/` | Separate ODDS analytics project |
| Root landing page (`index.html`, `js/main.js`, `css/styles.css`) | GP Orbit portfolio shell |
| `starter/` | Unrelated; ignore |
| `performanceChart.js` | ODDS chart code |
| Shared deploy plumbing | Only touch `vercel.json` if sine routing breaks; no odds/API changes for sine work |

Sine uses absolute paths (`/sine/...`). Only external tie is back link `← GP Orbit` → `/`.

---

## Future work (parking lot)

- [ ] Mobile/touch polish beyond current paint mode
- [ ] Persist custom pieces (localStorage or share URL only today)
- [ ] Per-world icon/marker tweaks without radar layout churn
- [ ] Sound preset save/load (macros + advanced)
- [ ] Accessibility pass (grid keyboard navigation, reduced motion)
- [ ] Dedicated sine dev script or port note in README if `serve.py` startup messaging stays odds-centric
