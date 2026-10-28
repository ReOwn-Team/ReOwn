import { useCallback, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { useDismiss } from '../lib/useDismiss.js';
import { ACCENTS, MODES, readTheme, saveTheme } from '../lib/theme.js';

export default function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(readTheme);
  const box = useRef(null);

  useDismiss(box, open, useCallback(() => setOpen(false), []));

  const set = (patch) => { const t = { ...theme, ...patch }; setTheme(t); saveTheme(t); };

  return (
    <div className="theme" ref={box}>
      <button type="button" className="theme-btn" aria-label="Giao diện" aria-expanded={open} aria-controls="theme-pop" onClick={() => setOpen(!open)}>
        <Icon name="palette" />
      </button>
      {open && (
        <div className="theme-pop" id="theme-pop" role="group" aria-label="Giao diện">
          <fieldset>
            <legend>Chế độ</legend>
            <div className="seg">
              {MODES.map((m) => (
                <label key={m.v} className={theme.mode === m.v ? 'on' : ''}>
                  <input type="radio" name="theme-mode" className="sr-only" checked={theme.mode === m.v} onChange={() => set({ mode: m.v })} />
                  <Icon name={m.icon} size={18} /><span>{m.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Màu chủ đạo</legend>
            <div className="swatches">
              {ACCENTS.map((a) => (
                <label key={a.v} className={theme.accent === a.v ? 'on' : ''}>
                  <input type="radio" name="theme-accent" className="sr-only" checked={theme.accent === a.v} onChange={() => set({ accent: a.v })} />
                  <span className="sw" style={{ background: a.swatch }}>{theme.accent === a.v && <Icon name="check" size={16} />}</span>
                  <span>{a.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
