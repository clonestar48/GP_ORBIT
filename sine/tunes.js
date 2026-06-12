/**
 * Simplified monophonic tunes for the 8-row grid (C5→C4).
 * Row indices: 0=C5, 1=B4, 2=A4, 3=G4, 4=F4, 5=E4, 6=D4, 7=C4
 *
 * Classics are shortened opening phrases — not full arrangements.
 * Chromatic notes (e.g. D# in Für Elise) are approximated to the nearest row.
 */

export const TUNE_CATEGORIES = [
  {
    id: 'nursery',
    label: 'Nursery',
    songs: {
      twinkle: {
        label: 'Twinkle',
        tempo: 200,
        phraseSteps: 16,
        notes: [0, 0, 3, 3, 2, 2, 3, 4, 4, 5, 5, 6, 6, 7],
      },
      'hot-cross': {
        label: 'Hot Cross Buns',
        tempo: 220,
        phraseSteps: 16,
        notes: [5, 6, 7, 5, 6, 7, 7, 7, 7, 6, 6, 6, 6, 5, 6, 7],
      },
      mary: {
        label: 'Mary',
        tempo: 200,
        phraseSteps: 16,
        notes: [5, 6, 7, 6, 5, 5, 5, 6, 6, 6, 6, 5, 3, 3],
      },
    },
  },
  {
    id: 'classics',
    label: 'Classics',
    songs: {
      'fur-elise': {
        label: 'Für Elise',
        tempo: 180,
        phraseSteps: 16,
        // Beethoven — iconic E–D–E motif (D# ≈ D)
        notes: [5, 6, 5, 6, 5, 1, 6, 7, 2, 5, 6, 5, 6, 5, 1, 6],
      },
      'ode-to-joy': {
        label: 'Ode to Joy',
        tempo: 200,
        phraseSteps: 16,
        notes: [5, 5, 4, 3, 3, 4, 5, 6, 7, 7, 6, 5, 5, 6, 6],
      },
      'beethoven-5': {
        label: 'Symphony No. 5',
        tempo: 140,
        phraseSteps: 8,
        // Short-short-short-long motif (E–E–E–C, D–D–D–C)
        notes: [5, 5, 5, 7, 6, 6, 6, 7],
      },
      minuet: {
        label: 'Minuet in G',
        tempo: 190,
        phraseSteps: 16,
        notes: [6, 6, 3, 3, 2, 3, 2, 6, 1, 1, 3, 3, 2, 3, 6, 6],
      },
      moonlight: {
        label: 'Moonlight',
        tempo: 300,
        phraseSteps: 16,
        // 1st-mvt arpeggio feel: G–E–C repeated
        notes: [3, 5, 7, 3, 5, 7, 2, 5, 7, 2, 5, 7, 3, 5, 7, 3],
      },
      canon: {
        label: 'Canon in D',
        tempo: 200,
        phraseSteps: 16,
        notes: [6, 2, 1, 4, 3, 6, 3, 2, 6, 2, 1, 4, 3, 6, 3, 2],
      },
      'happy-birthday': {
        label: 'Happy Birthday',
        tempo: 240,
        phraseSteps: 12,
        notes: [7, 7, 6, 7, 4, 5, 7, 7, 6, 7, 3, 4],
      },
      'william-tell': {
        label: 'William Tell',
        tempo: 150,
        phraseSteps: 16,
        notes: [3, 3, 2, 0, 0, 2, 3, 5, 3, 3, 2, 0, 0, 2, 3, 5],
      },
      'amazing-grace': {
        label: 'Amazing Grace',
        tempo: 260,
        phraseSteps: 16,
        notes: [7, 4, 2, 2, 3, 4, 5, 6, 7, 7, 4, 2, 2, 3, 4, 5],
      },
    },
  },
  {
    id: 'games',
    label: 'Games',
    songs: {
      'mario': {
        label: 'Super Mario Bros',
        tempo: 175,
        phraseSteps: 16,
        // NES overworld — opening melody (E–E–E–C–E–G…)
        notes: [5, 5, 5, 7, 5, 3, 3, 7, 3, 5, 2, 1, 0, 7, 5, 3],
      },
      'sonic': {
        label: 'Sonic (Green Hill)',
        tempo: 155,
        phraseSteps: 16,
        // Genesis Green Hill Zone — main lead hook
        notes: [5, 3, 2, 1, 2, 3, 5, 7, 6, 5, 3, 5, 6, 7, 5, 3],
      },
    },
  },
];

/** Flat map of song key → template (used by melody sequencer). */
export const SONG_TEMPLATES = TUNE_CATEGORIES.reduce((acc, cat) => {
  Object.assign(acc, cat.songs);
  return acc;
}, {});
