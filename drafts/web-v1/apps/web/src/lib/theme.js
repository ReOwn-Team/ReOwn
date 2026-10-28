const THEME_KEY = 'reown-theme';
export const MODES = [
  { v: 'light', label: 'Sáng', icon: 'sun' },
  { v: 'dark', label: 'Tối', icon: 'moon' },
  { v: 'system', label: 'Theo máy', icon: 'monitor' },
];
export const ACCENTS = [
  { v: 'green', label: 'Xanh lá', swatch: '#0b7a5b' },
  { v: 'blue', label: 'Xanh dương', swatch: '#2563eb' },
  { v: 'orange', label: 'Cam', swatch: '#c2410c' },
  { v: 'violet', label: 'Tím', swatch: '#7c3aed' },
];
const DEFAULT_THEME = { mode: 'system', accent: 'green' };

export function readTheme() {
  try {
    const t = JSON.parse(localStorage.getItem(THEME_KEY) || 'null');
    if (t && MODES.some((m) => m.v === t.mode) && ACCENTS.some((a) => a.v === t.accent)) return t;
  } catch { }
  return DEFAULT_THEME;
}

function applyTheme({ mode, accent }) {
  const root = document.documentElement;
  if (mode === 'system') delete root.dataset.theme; else root.dataset.theme = mode;
  if (accent === 'green') delete root.dataset.accent; else root.dataset.accent = accent;
}

export function saveTheme(t) {
  applyTheme(t);
  try { localStorage.setItem(THEME_KEY, JSON.stringify(t)); } catch { }
}
