// Deterministic generated avatar from a handle hash — no external avatar
// service (Gravatar, DiceBear's hosted API, etc.), so a handle is never
// sent to a third party just to render a profile picture. Pure function,
// same handle always produces the same avatar, computed entirely locally.

const INK_COLORS = [
  "oklch(0.56 0.19 28)", // vermilion
  "oklch(0.512 0.102 197)", // teal
  "oklch(0.482 0.128 305)", // violet
  "oklch(0.618 0.13 74)", // ochre
];

function hash(seed: string): number {
  let h = 0;
  for (const char of seed) {
    h = (h * 31 + char.charCodeAt(0)) | 0;
  }
  return Math.abs(h);
}

// A 5x5 symmetric grid, registration-mark style, in one of the four stamp
// inks — visually consistent with the passport system rather than a
// generic identicon library's default look.
export function avatarSvg(seed: string, size = 40): string {
  const h = hash(seed);
  const color = INK_COLORS[h % INK_COLORS.length];
  const cells: boolean[][] = [];
  let bits = h;
  for (let row = 0; row < 5; row++) {
    const rowCells: boolean[] = [];
    for (let col = 0; col < 3; col++) {
      bits = (bits * 1103515245 + 12345) & 0x7fffffff;
      rowCells.push(bits % 2 === 0);
    }
    cells.push([...rowCells, ...rowCells.slice(0, 2).reverse()]);
  }

  const cellSize = size / 5;
  const rects = cells
    .flatMap((row, y) =>
      row.map((filled, x) => (filled ? `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}"/>` : ""))
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Generated avatar"><rect width="${size}" height="${size}" fill="oklch(0.945 0.012 92)"/><g fill="${color}">${rects}</g></svg>`;
}

export function avatarDataUri(seed: string, size = 40): string {
  const svg = avatarSvg(seed, size);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
