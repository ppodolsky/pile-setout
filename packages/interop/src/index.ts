/**
 * CAD import/export for 2D sketches with piles: a neutral {@link InteropDocument} and converters to
 * DXF (R12, geometry), SolveSpace `.slvs` (geometry + constraints), FreeCAD `.FCStd` (Sketcher,
 * export), SVG (print, export) and survey point CSV (stake-out). See README.md for the trade-offs.
 *
 * @example
 * ```ts
 * import { toDXF, fromSLVS, exportWarnings } from '@buildkit/interop';
 * const dxf = toDXF(doc);                       // string, millimetres
 * const lost = exportWarnings(doc, 'dxf');      // ["18 constraint(s) dropped — DXF stores geometry only"]
 * const { document, warnings } = fromSLVS(text);
 * ```
 */
export * from './model';
export { InteropError, checkDocument } from './doc';
export { FORMATS, formatOf, exportWarnings, type FormatId, type FormatInfo } from './formats';
export { toDXF, exportDXF, DXF_LAYERS, type DxfOptions } from './dxf-write';
export { fromDXF, type DxfImportOptions } from './dxf-read';
export { toSLVS, toSLVSBytes, exportSLVS, HELPER_STYLE_NAME } from './slvs-write';
export { fromSLVS } from './slvs-read';
export { slvsBytes, slvsText } from './slvs-format';
export { toFCStd, exportFCStd } from './fcstd';
export { toSVG, exportSVG, autoScale, STANDARD_SCALES, DEFAULT_SVG_CSS, type SvgOptions } from './svg';
export { toPointsCSV, exportPointsCSV, fromPointsCSV, type PointsCsvOptions } from './csv';
