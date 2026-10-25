const nf = new Map<number, Intl.NumberFormat>();

/** 2,929.5 — thousands separators, up to `digits` decimals. */
export function fmt(v: number, digits = 1): string {
  let f = nf.get(digits);
  if (!f) nf.set(digits, (f = new Intl.NumberFormat('en-US', { maximumFractionDigits: digits })));
  return f.format(v);
}

/** Signed: +2.5 / −2.5 (true minus sign). */
export function sfmt(v: number, digits = 1): string {
  return (v >= 0 ? '+' : '−') + fmt(Math.abs(v), digits);
}

export const plural = (n: number, one: string, other = `${one}s`): string => (n === 1 ? one : other);

/** Parses user input; accepts a decimal comma. */
export function parseNum(s: string): number | null {
  const v = Number.parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}
