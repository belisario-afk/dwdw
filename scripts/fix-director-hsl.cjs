/* Robust fixer for src/controllers/director.ts:
   - Removes any broken/duplicate hslToRgb function(s)
   - Inserts a known-good hslToRgb implementation
   - Replaces standalone "or" with "||" in code
*/
const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src', 'controllers', 'director.ts');
if (!fs.existsSync(file)) {
  console.error('Not found:', file);
  process.exit(1);
}

let raw = fs.readFileSync(file, 'utf8');
let s = raw.replace(/\r\n/g, '\n'); // normalize EOLs

// 1) Replace standalone "or" with "||" (won't match "color"/"origin" etc.)
s = s.replace(/\bor\b/g, '||');

// 2) Known-good hslToRgb implementation
const goodFn = `
function hslToRgb(h: number, s: number, l: number) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255)
  };
}
`.trim();

// 3) Remove any existing/truncated hslToRgb definitions (one or more)
// Strategy: find "function hslToRgb(" and cut until the next function/class/const/export or EOF.
const removeAllHsl = () => {
  const startRe = /function\s+hslToRgb\s*\(/g;
  let changed = false;
  let match;
  while ((match = startRe.exec(s)) !== null) {
    const start = match.index;
    // Find boundary after current start (next function/class/const/export or end)
    const boundaryRe = /\n(?:export\s+)?function\s+|\nclass\s+|\nconst\s+|\nlet\s+|\nvar\s+|\nexport\s+|\n\/\/|$/g;
    boundaryRe.lastIndex = start + 1;
    const bMatch = boundaryRe.exec(s);
    const end = bMatch ? bMatch.index : s.length;
    // Remove the block
    s = s.slice(0, start) + s.slice(end);
    changed = true;
    // Reset search from beginning since string changed
    startRe.lastIndex = 0;
  }
  return changed;
};
removeAllHsl();

// 4) Insert good hslToRgb in the Colors helpers section
// Preferred: insert right after rgbToHsl; fallback: append to end of file.
const rgbIdx = s.indexOf('function rgbToHsl');
if (rgbIdx !== -1) {
  // Find the end of that function: naive but effective — first "\n}" after its start
  const closeIdx = s.indexOf('\n}', rgbIdx);
  const insertPos = closeIdx !== -1 ? closeIdx + 2 : rgbIdx;
  s = s.slice(0, insertPos) + '\n\n' + goodFn + '\n' + s.slice(insertPos);
} else {
  s = s.trimEnd() + '\n\n' + goodFn + '\n';
}

// 5) Write back (preserve Windows CRLF if the original had it)
const useCRLF = /\r\n/.test(raw);
if (useCRLF) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(file, s, 'utf8');

console.log('Patched:', file);

// 6) Sanity check
if (!s.includes('const x = c * (1 - Math.abs(((h / 60) % 2) - 1));')) {
  console.warn('WARNING: Could not verify the critical "x =" line in hslToRgb.');
}
if (!s.includes('else if (h < 240) { r1 = 0; g1 = x; b1 = c; }')) {
  console.warn('WARNING: Could not verify the (h < 240) branch in hslToRgb.');
}