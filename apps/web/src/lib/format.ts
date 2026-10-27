import { currentLocale } from '@/i18n';

const nf = new Map<string, Intl.NumberFormat>();

/** 2,929.5 (en) / 2 929,5 (ru) — grouped, up to `digits` decimals, in the current language. */
export function fmt(v: number, digits = 1): string {
  const locale = currentLocale();
  const key = `${locale}:${digits}`;
  let f = nf.get(key);
  if (!f) nf.set(key, (f = new Intl.NumberFormat(locale, { maximumFractionDigits: digits })));
  return f.format(v);
}

/** The decimal separator of the current language ("." or ","), for editable numbers. */
export const decimalSeparator = (): string => (1.5).toLocaleString(currentLocale()).charAt(1);

/** Signed: +2.5 / −2.5 (true minus sign). */
export function sfmt(v: number, digits = 1): string {
  return (v >= 0 ? '+' : '−') + fmt(Math.abs(v), digits);
}


/** Parses user input; accepts a decimal comma. */
export function parseNum(s: string): number | null {
  const v = Number.parseFloat(s.replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}
