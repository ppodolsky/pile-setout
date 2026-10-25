/**
 * The SolveSpace `.slvs` text format, as written by `SolveSpaceUI::SaveToFile` (src/file.cpp): a
 * version line, then records of `Key=value` lines each closed by `AddGroup`, `AddParam`,
 * `AddRequest`, `AddEntity`, `AddConstraint` or `AddStyle`. Values are formatted per the save table:
 * handles `%08x`, integers `%d`, reals `%.20f`, booleans `0/1`, strings verbatim; zero handles,
 * integers and reals and empty strings are omitted (they load as 0). Ids and enums below are from
 * src/sketch.h.
 */

/** First line: bytes B1 B2 B3 then "SolveSpaceREVa" (here as Latin-1 code points). */
export const SLVS_VERSION = '\u00b1\u00b2\u00b3SolveSpaceREVa';

export const GroupType = { DRAWING_3D: 5000, DRAWING_WORKPLANE: 5001 } as const;

export const RequestType = {
  WORKPLANE: 100,
  DATUM_POINT: 101,
  LINE_SEGMENT: 200,
  CUBIC: 300,
  CUBIC_PERIODIC: 301,
  CIRCLE: 400,
  ARC_OF_CIRCLE: 500,
  TTF_TEXT: 600,
  IMAGE: 700,
} as const;

export const EntityType = {
  POINT_IN_3D: 2000,
  POINT_IN_2D: 2001,
  POINT_N_COPY: 2012,
  NORMAL_IN_3D: 3000,
  NORMAL_N_COPY: 3010,
  WORKPLANE: 10000,
  LINE_SEGMENT: 11000,
} as const;

export const ConstraintType = {
  POINTS_COINCIDENT: 20,
  PT_PT_DISTANCE: 30,
  PT_PLANE_DISTANCE: 31,
  PT_LINE_DISTANCE: 32,
  PT_FACE_DISTANCE: 33,
  PROJ_PT_DISTANCE: 34,
  PT_IN_PLANE: 41,
  PT_ON_LINE: 42,
  PT_ON_FACE: 43,
  EQUAL_LENGTH_LINES: 50,
  LENGTH_RATIO: 51,
  EQ_LEN_PT_LINE_D: 52,
  EQ_PT_LN_DISTANCES: 53,
  EQUAL_ANGLE: 54,
  EQUAL_LINE_ARC_LEN: 55,
  LENGTH_DIFFERENCE: 56,
  SYMMETRIC: 60,
  SYMMETRIC_HORIZ: 61,
  SYMMETRIC_VERT: 62,
  SYMMETRIC_LINE: 63,
  AT_MIDPOINT: 70,
  HORIZONTAL: 80,
  VERTICAL: 81,
  DIAMETER: 90,
  PT_ON_CIRCLE: 100,
  SAME_ORIENTATION: 110,
  ANGLE: 120,
  PARALLEL: 121,
  PERPENDICULAR: 122,
  ARC_LINE_TANGENT: 123,
  CUBIC_LINE_TANGENT: 124,
  CURVE_CURVE_TANGENT: 125,
  EQUAL_RADIUS: 130,
  WHERE_DRAGGED: 200,
  ARC_ARC_LEN_RATIO: 210,
  ARC_LINE_LEN_RATIO: 211,
  ARC_ARC_DIFFERENCE: 212,
  ARC_LINE_DIFFERENCE: 213,
  COMMENT: 1000,
} as const;

/** Name of a constraint type id, for warnings. */
export const constraintTypeName = (type: number): string =>
  Object.entries(ConstraintType).find(([, v]) => v === type)?.[0] ?? `type ${type}`;

/** hRequest::entity(i) = request << 16 | i. */
export const requestEntity = (request: number, i: number): number => ((request << 16) | i) >>> 0;
/** hRequest::param(i) = request << 16 | i; point k of a request owns params 16 + 3k (+1, +2). */
export const requestParam = (request: number, i: number): number => ((request << 16) | i) >>> 0;
/** hConstraint::param(i) = constraint | 0x40000000 | i. */
export const constraintParam = (constraint: number, i: number): number => (constraint | 0x40000000 | i) >>> 0;
/** hGroup::entity(i) = 0x80000000 | group << 16 | i. */
export const groupEntity = (group: number, i: number): number => (0x80000000 | (group << 16) | i) >>> 0;

/** Reference requests of every sketch: the XY, YZ and ZX planes (group 1, "#references"). */
export const REF_XY = 1;
export const REF_YZ = 2;
export const REF_ZX = 3;
/** Our drawing group and its workplane (a copy of XY: u = X, v = Y). */
export const SKETCH_GROUP = 2;
export const WORKPLANE = groupEntity(SKETCH_GROUP, 0);
/** Normals of the YZ and ZX reference planes point along +X and +Y: directions for ΔX / ΔY / angles. */
export const X_AXIS = requestEntity(REF_YZ, 0x20);
export const Y_AXIS = requestEntity(REF_ZX, 0x20);
/** First custom style handle (Style::FIRST_CUSTOM). */
export const FIRST_CUSTOM_STYLE = 0x100;

export const hex8 = (v: number): string => (v >>> 0).toString(16).padStart(8, '0');

/** Field formats of the save table: handle, integer, real, boolean, string. */
export type Field = readonly [key: string, fmt: 'x' | 'd' | 'f' | 'b' | 'S', value: number | boolean | string | undefined];

/** One record as SolveSpace writes it (zero/empty values omitted, booleans always written). */
export function record(fields: readonly Field[], terminator: string): string {
  let s = '';
  for (const [key, fmt, v] of fields) {
    if (v == null) continue;
    switch (fmt) {
      case 'x':
        if (v) s += `${key}=${hex8(Number(v))}\n`;
        break;
      case 'd':
        if (v) s += `${key}=${Number(v)}\n`;
        break;
      case 'f':
        if (Number(v) !== 0) s += `${key}=${Number(v).toFixed(20)}\n`;
        break;
      case 'b':
        s += `${key}=${v ? 1 : 0}\n`;
        break;
      case 'S':
        if (v !== '') s += `${key}=${String(v)}\n`;
        break;
    }
  }
  return `${s}${terminator}\n\n`;
}

/** A parsed record: its terminator ("AddParam"…) and key → raw value. */
export interface SlvsRecord {
  kind: string;
  fields: Map<string, string>;
}

/**
 * Splits `.slvs` text into records. Accepts any first line ending in "SolveSpaceREVa" (the B1 B2 B3
 * prefix often arrives mangled by a UTF-8 decode); skips the mesh/shell lines SolveSpace regenerates.
 *
 * @throws Error if the text is not a SolveSpace file.
 */
export function parseRecords(text: string): SlvsRecord[] {
  const lines = text.split(/\r?\n/);
  if (!lines[0]?.endsWith('SolveSpaceREVa')) throw new Error('not a SolveSpace file (missing "SolveSpaceREVa" header)');
  const out: SlvsRecord[] = [];
  let fields = new Map<string, string>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line) continue;
    const eq = line.indexOf('=');
    if (eq >= 0) {
      let value = line.slice(eq + 1);
      if (value === '{') {
        // multi-line map (Group.remap): up to the closing brace
        while (i + 1 < lines.length && lines[i + 1] !== '}') value += `\n${lines[++i]}`;
        i++;
        value += '\n}';
      }
      fields.set(line.slice(0, eq), value);
    } else if (line.startsWith('Add') && !/\s/.test(line)) {
      out.push({ kind: line, fields });
      fields = new Map();
    }
  }
  return out;
}

/** SolveSpace files mix a Latin-1 version line with UTF-8 strings; this is the on-disk byte form. */
export function slvsBytes(text: string): Uint8Array {
  const body = text.startsWith(SLVS_VERSION) ? text.slice(SLVS_VERSION.length) : text;
  const head = text.startsWith(SLVS_VERSION) ? [0xb1, 0xb2, 0xb3, ...Array.from('SolveSpaceREVa', (c) => c.charCodeAt(0))] : [];
  const utf8 = new TextEncoder().encode(body);
  const out = new Uint8Array(head.length + utf8.length);
  out.set(head);
  out.set(utf8, head.length);
  return out;
}

/** Decodes on-disk `.slvs` bytes (Latin-1 version line, UTF-8 rest) to the text form. */
export function slvsText(bytes: Uint8Array): string {
  const nl = bytes.indexOf(0x0a);
  const first = Array.from(bytes.subarray(0, nl < 0 ? bytes.length : nl), (b) => String.fromCharCode(b)).join('');
  return first + (nl < 0 ? '' : new TextDecoder().decode(bytes.subarray(nl)));
}
