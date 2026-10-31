// Persistent user preferences (per device).
const KEY = 'langreader.settings';

const defaults = {
  lang: 'it',
  target: 'en',
  email: '',               // optional: raises MyMemory's free quota
  theme: 'original',       // original | quiet | paper | bold | calm | focus
  appearance: 'auto',      // auto | light | dark  (reader dark variant)
  font: 'original',
  size: 20,
  lineHeight: 1.5,
  margin: 26,
  justify: true,
  paraSpace: 0,
  autoKnown: true,         // LingQ: paging forward marks remaining blue words as known
  pageTurn: 'curl',        // curl | slide | none (Apple Books' page turn styles)
  haptics: true,
  highlights: true,
  hlStyle: 'underline',    // underline | background (LingQ's two highlight styles)
  commonHL: true,          // new words among the 2,000 most common get a stronger mark
  rate: 0.9,
  voice: '',               // '' Riccardo | piper:paola | piper:serena | system | a device voice's name
  speakOnTap: true,        // tapping a word also says it
  goalMinutes: 15,
  retention: 'normal',     // relaxed | normal | intense: how much of your LingQs reviews aim to keep (80/85/90%)
  reviewsPerDay: 20,       // due cards offered a day; the rest wait, most valuable first
  newPerDay: 10,           // LingQs that start reviews each day (reading introduces others)
};

let stored = {};
try { stored = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { stored = {}; }

export const settings = new Proxy({ ...defaults, ...stored }, {
  set(obj, prop, value) {
    obj[prop] = value;
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch {}
    return true;
  },
});

// Apple Books' font menu. iOS ships all of these; other platforms fall back gracefully.
export const FONTS = {
  original: { name: 'Original', css: 'ui-serif, "New York", "Iowan Old Style", Georgia, serif' },
  athelas: { name: 'Athelas', css: 'Athelas, "Iowan Old Style", Georgia, serif' },
  charter: { name: 'Charter', css: 'Charter, "Bitstream Charter", "Charis SIL", Georgia, serif' },
  georgia: { name: 'Georgia', css: 'Georgia, serif' },
  iowan: { name: 'Iowan', css: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif' },
  palatino: { name: 'Palatino', css: 'Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif' },
  sanfrancisco: { name: 'San Francisco', css: '-apple-system, BlinkMacSystemFont, system-ui, "Helvetica Neue", sans-serif' },
  seravek: { name: 'Seravek', css: 'Seravek, "Gill Sans Nova", Ubuntu, Calibri, sans-serif' },
  times: { name: 'Times New Roman', css: '"Times New Roman", Times, serif' },
};

// Apple Books themes: name, swatch colours, and default font.
export const THEMES = {
  original: { name: 'Original', bg: '#ffffff', fg: '#000000', dbg: '#000000', dfg: '#e6e6e6' },
  quiet: { name: 'Quiet', bg: '#4a4a4d', fg: '#d6d6d6', dbg: '#2c2c2e', dfg: '#d6d6d6' },
  paper: { name: 'Paper', bg: '#efece6', fg: '#2a2a2a', dbg: '#1d1c1a', dfg: '#cfcac0' },
  bold: { name: 'Bold', bg: '#ffffff', fg: '#000000', dbg: '#000000', dfg: '#ffffff', weight: 600 },
  calm: { name: 'Calm', bg: '#f1e2c9', fg: '#000000', dbg: '#2b2418', dfg: '#e3d3b3', font: 'palatino' },
  focus: { name: 'Focus', bg: '#fbf6e6', fg: '#1f1a10', dbg: '#1e1b14', dfg: '#e8dfc8', font: 'charter' },
};

export const TARGETS = { en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português', nl: 'Nederlands', pl: 'Polski' };
