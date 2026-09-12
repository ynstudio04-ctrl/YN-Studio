import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "yn_customer_secret_theme_v2";

const ThemeContext = createContext({
  theme: "default",
  setTheme: () => {},
  activateTheme: () => false,
  resetTheme: () => {},
});

function playThemeSound(theme) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.18, now + 0.025);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);
    master.connect(ctx.destination);

    // Original synthesized squeak/chirp — not a recording of a copyrighted character.
    const notes = theme === "usagi"
      ? [
          [720, 0.00, 0.16],
          [980, 0.11, 0.16],
          [1240, 0.22, 0.12],
          [880, 0.34, 0.20],
        ]
      : [
          [520, 0.00, 0.14],
          [680, 0.12, 0.15],
          [820, 0.24, 0.14],
          [610, 0.35, 0.20],
        ];

    notes.forEach(([freq, start, duration]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + start);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.12, now + start + duration);
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.12, now + start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.02);
    });

    window.setTimeout(() => {
      try { ctx.close(); } catch {}
    }, 900);
  } catch {}
}

export function CustomerThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === "usagi" || saved === "chiikawa" ? saved : "default";
    } catch {
      return "default";
    }
  });

  useEffect(() => {
    try {
      if (theme === "default") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, theme);
    } catch {}

    document.documentElement.dataset.customerTheme = theme;
    document.body.dataset.customerTheme = theme;

    return () => {};
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    setTheme: (next) => {
      const normalized = next === "usagi" || next === "chiikawa" ? next : "default";
      setThemeState(normalized);
    },
    activateTheme: (next) => {
      const normalized = next === "usagi" || next === "chiikawa" ? next : "default";
      setThemeState(normalized);
      if (normalized !== "default") playThemeSound(normalized);
      return normalized !== "default";
    },
    resetTheme: () => setThemeState("default"),
  }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useCustomerTheme() {
  return useContext(ThemeContext);
}
