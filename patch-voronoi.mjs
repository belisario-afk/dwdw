import { readFileSync, writeFileSync } from 'fs';

const path = 'src/controllers/director.ts';
let txt = readFileSync(path, 'utf8');
const original = txt;

// 1) Replace the truncated "poly" line that follows sx/sy
// Matches:
//   const sx = sj.x - si.x;
//   const sy = sj.y - si.y;
//   poly
const rx = /(const\s+sx\s*=\s*sj\.x\s*-\s*si\.x;\s*\r?\n\s*const\s+sy\s*=\s*sj\.y\s*-\s*si\.y;\s*\r?\n)\s*poly\s*(?:;)?/;
txt = txt.replace(
  rx,
  `$1      poly = clipPolygonHalfPlane(poly, sx, sy, mx, my);\n      if (poly.length === 0) break;`
);

// Fallback: if still a lone "poly" line exists anywhere, fix it once
if (/^[ \t]*poly[ \t]*;?[ \t]*$/m.test(txt)) {
  txt = txt.replace(
    /^[ \t]*poly[ \t]*;?[ \t]*$/m,
    `      poly = clipPolygonHalfPlane(poly, sx, sy, mx, my);\n      if (poly.length === 0) break;`
  );
}

// 2) Ensure the helper exists exactly once and is outside the class.
// If missing, append it to the end of the file.
const hasHelper = /function\s+clipPolygonHalfPlane\s*\(/.test(txt);
if (!hasHelper) {
  const helper = `

// Keep points P such that dot(P - M, S) <= 0
function clipPolygonHalfPlane(
  poly: Array<{ x: number; y: number }>,
  sx: number,
  sy: number,
  mx: number,
  my: number
) {
  if (poly.length === 0) return poly;
  const out: Array<{ x: number; y: number }> = [];
  const f = (px: number, py: number) => (px - mx) * sx + (py - my) * sy; // <= 0 is inside

  for (let i = 0; i < poly.length; i++) {
    const A = poly[i];
    const B = poly[(i + 1) % poly.length];
    const fa = f(A.x, A.y);
    const fb = f(B.x, B.y);
    const ain = fa <= 0;
    const bin = fb <= 0;

    if (ain && bin) {
      out.push({ x: B.x, y: B.y });
    } else if (ain && !bin) {
      const t = fa / (fa - fb);
      out.push({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t });
    } else if (!ain && bin) {
      const t = fa / (fa - fb);
      out.push({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t });
      out.push({ x: B.x, y: B.y });
    }
  }

  return out;
}
`;
  txt += helper;
}

// If nothing changed, tell the user
if (txt === original) {
  console.error('No changes made. The file may already be fixed, or computeVoronoi was edited differently.');
  // Still write back just in case CRLF normalization is needed? No
} else {
  writeFileSync(path, txt, 'utf8');
  console.log('Patched src/controllers/director.ts');
}

// 3) Final sanity checks
if (/^[ \t]*poly[ \t]*;?[ \t]*$/m.test(txt)) {
  console.error('ERROR: A dangling "poly" line still exists. Please paste the ~20 lines around it here.');
  process.exit(2);
}
if ((txt.match(/function\s+clipPolygonHalfPlane\s*\(/g) || []).length > 1) {
  console.error('ERROR: Found multiple clipPolygonHalfPlane helpers. Keep only one copy outside the class.');
  process.exit(3);
}
console.log('Sanity checks passed.');