/** Short random id for new entities (stable React keys and references). */
export const uid = (prefix = ''): string =>
  prefix + (globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10));
