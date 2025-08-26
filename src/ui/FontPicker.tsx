import React, { useEffect, useMemo, useState } from 'react';
import { setLyricsFont, LYRIC_FONTS } from '@/utils/lyricsFont';

const DEFAULT_LABEL = 'Bebas Neue';

export default function FontPicker() {
  const labels = useMemo(
    () => Object.keys(LYRIC_FONTS) as Array<keyof typeof LYRIC_FONTS>,
    []
  );
  const [value, setValue] = useState<string>(DEFAULT_LABEL);

  useEffect(() => {
    const saved = localStorage.getItem('lyrics-font-label');
    const label = (saved && saved in LYRIC_FONTS ? saved : DEFAULT_LABEL) as keyof typeof LYRIC_FONTS;
    setValue(label);
    setLyricsFont(LYRIC_FONTS[label]); // apply on load
  }, []);

  function onChange(label: string) {
    setValue(label);
    const stack = LYRIC_FONTS[label as keyof typeof LYRIC_FONTS] ?? LYRIC_FONTS[DEFAULT_LABEL];
    setLyricsFont(stack);
    localStorage.setItem('lyrics-font-label', label);
  }

  return (
    <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <span>Lyrics font</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {labels.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}