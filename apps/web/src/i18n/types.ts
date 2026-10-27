/**
 * A translation of a namespace: every key of the English original, translated. Plural keys follow
 * i18next (`x_one`, `x_other`; Russian also `x_few`, `x_many`), so extra plural forms are allowed.
 */
export type Translation<T> = { readonly [K in keyof T]: T[K] extends string ? string : Translation<T[K]> } & {
  readonly [k: `${string}_few` | `${string}_many` | `${string}_two` | `${string}_zero`]: string;
};
