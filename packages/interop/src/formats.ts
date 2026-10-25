import { exportPointsCSV } from './csv';
import { exportDXF } from './dxf-write';
import { exportFCStd } from './fcstd';
import type { InteropDocument } from './model';
import { exportSLVS } from './slvs-write';
import { exportSVG } from './svg';

export type FormatId = 'dxf' | 'slvs' | 'fcstd' | 'svg' | 'csv';

export interface FormatInfo {
  readonly id: FormatId;
  readonly name: string;
  /** File extensions, without the dot, preferred first. */
  readonly extensions: readonly string[];
  readonly canImport: boolean;
  readonly canExport: boolean;
  /** Constraints survive the format (natively, not as comments). */
  readonly keepsConstraints: boolean;
  /** Export is bytes (Uint8Array) rather than text. */
  readonly binary: boolean;
  readonly mime: string;
}

/** The formats this package reads and writes, for file pickers and export menus. */
export const FORMATS: readonly FormatInfo[] = [
  {
    id: 'dxf',
    name: 'AutoCAD DXF (R12)',
    extensions: ['dxf'],
    canImport: true,
    canExport: true,
    keepsConstraints: false,
    binary: false,
    mime: 'image/vnd.dxf',
  },
  {
    id: 'slvs',
    name: 'SolveSpace sketch',
    extensions: ['slvs'],
    canImport: true,
    canExport: true,
    keepsConstraints: true,
    binary: true,
    mime: 'application/x-solvespace',
  },
  {
    id: 'fcstd',
    name: 'FreeCAD document (Sketcher)',
    extensions: ['FCStd', 'fcstd'],
    canImport: false,
    canExport: true,
    keepsConstraints: true,
    binary: true,
    mime: 'application/x-extension-fcstd',
  },
  {
    id: 'svg',
    name: 'SVG drawing (print)',
    extensions: ['svg'],
    canImport: false,
    canExport: true,
    keepsConstraints: false,
    binary: false,
    mime: 'image/svg+xml',
  },
  {
    id: 'csv',
    name: 'Survey point list (CSV, PENZD)',
    extensions: ['csv', 'txt'],
    canImport: true,
    canExport: true,
    keepsConstraints: false,
    binary: false,
    mime: 'text/csv',
  },
];

/** Format of a file name by its extension (case-insensitive), if supported. */
export function formatOf(fileName: string): FormatInfo | undefined {
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  return FORMATS.find((f) => f.extensions.some((e) => e.toLowerCase() === ext));
}

/**
 * What exporting the document to a format would drop or approximate, in plain words (empty when
 * nothing is lost). Runs the exporter with its default options.
 *
 * @throws InteropError if the document references missing points.
 */
export function exportWarnings(doc: InteropDocument, format: FormatId): string[] {
  switch (format) {
    case 'dxf':
      return exportDXF(doc).warnings;
    case 'slvs':
      return exportSLVS(doc).warnings;
    case 'fcstd':
      return exportFCStd(doc).warnings;
    case 'svg':
      return exportSVG(doc).warnings;
    case 'csv':
      return exportPointsCSV(doc).warnings;
  }
}
