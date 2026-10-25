/**
 * ISO 668 freight containers (Annex A). `cast` is the distance from the container end to the
 * centre of the corner-casting aperture: (L − S) / 2 with S = 2787 / 5853 / 11985 mm.
 * Intermediate supports sit under the side rails; they are an editable starting point — check
 * their contact with the actual container before pouring concrete.
 */
export const CONTAINERS = {
  '10': { label: "10'", length: 2991, cast: 102, mids: [] as number[], pockets: false },
  '20': { label: "20'", length: 6058, cast: 102.5, mids: [3029], pockets: true },
  '40': { label: "40'", length: 12192, cast: 103.5, mids: [3048, 9144], pockets: false },
} as const satisfies Record<string, ContainerSpec>;

export interface ContainerSpec {
  readonly label: string;
  /** External length, mm. */
  readonly length: number;
  /** End → corner-casting aperture centre, mm. */
  readonly cast: number;
  /** Intermediate support positions from the container start, mm. */
  readonly mids: readonly number[];
  /** Forklift pockets (drawn schematically). */
  readonly pockets: boolean;
}

export type ContainerType = keyof typeof CONTAINERS;
export const CONTAINER_TYPES = Object.keys(CONTAINERS) as ContainerType[];
export const isContainerType = (v: unknown): v is ContainerType => typeof v === 'string' && v in CONTAINERS;

/** External width of all ISO containers, mm. */
export const CONTAINER_WIDTH = 2438;
/** Corner casting footprint (along × across), mm; the aperture centre is 89.5 mm from the side. */
export const CASTING = { length: 178, width: 162, sideOffset: 89.5 } as const;
/** Forklift pocket positions on a 20' (centre from the start) and size, mm — schematic. */
export const POCKETS = { centers: [2005, 4053], length: 355, depth: 160 } as const;
