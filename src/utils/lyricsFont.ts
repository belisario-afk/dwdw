// Simple helper to change the lyrics font at runtime
export function setLyricsFont(stack: string, weight = 400) {
  const root = document.documentElement;
  root.style.setProperty('--lyrics-font', stack);
  root.style.setProperty('--lyrics-weight', String(weight));
}

// Preset stacks matching the installed fonts
export const LYRIC_FONTS = {
  'Bebas Neue': "'Bebas Neue', Impact, system-ui, sans-serif",
  'Bangers': "'Bangers', 'Comic Sans MS', system-ui, cursive",
  'Black Ops One': "'Black Ops One', Impact, system-ui, sans-serif",
  'Pacifico': "'Pacifico', 'Brush Script MT', cursive",
  'Press Start 2P': "'Press Start 2P', 'VT323', monospace",
} as const;