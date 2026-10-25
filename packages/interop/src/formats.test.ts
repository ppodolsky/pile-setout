import { describe, expect, it } from 'vitest';
import { sampleDocument } from './fixtures';
import { FORMATS, InteropError, checkDocument, exportWarnings, formatOf, type InteropDocument } from './index';

describe('FORMATS', () => {
  it('lists each format once, with an extension and a MIME type', () => {
    expect(FORMATS.map((f) => f.id)).toEqual(['dxf', 'slvs', 'fcstd', 'svg', 'csv']);
    expect(FORMATS.filter((f) => f.keepsConstraints).map((f) => f.id)).toEqual(['slvs', 'fcstd']);
    expect(FORMATS.every((f) => f.extensions.length > 0 && f.mime.includes('/'))).toBe(true);
  });

  it('finds a format by file name', () => {
    expect(formatOf('Site.FCStd')?.id).toBe('fcstd');
    expect(formatOf('plan.DXF')?.id).toBe('dxf');
    expect(formatOf('notes.docx')).toBeUndefined();
  });

  it('explains what each export loses', () => {
    const doc = sampleDocument();
    expect(exportWarnings(doc, 'slvs')).toEqual([]);
    expect(exportWarnings(doc, 'dxf')).toEqual(['18 constraint(s) dropped — DXF stores geometry only']);
    expect(exportWarnings(doc, 'fcstd')).toHaveLength(3);
  });
});

describe('checkDocument', () => {
  it('lists every dangling reference, duplicate id and bad coordinate', () => {
    const bad: InteropDocument = {
      units: 'mm',
      points: [
        { id: 'a', x: 0, y: Number.NaN },
        { id: 'a', x: 1, y: 1 },
      ],
      lines: [{ id: 'l', a: 'a', b: 'x' }],
      constraints: [{ id: 'c', kind: 'onLine', p: 'q', a: 'a', b: 'a' }],
      piles: [{ point: 'z' }],
    };
    expect(() => checkDocument(bad)).toThrow(InteropError);
    expect(() => checkDocument(bad)).toThrow(
      'Invalid document: point "a" has a non-finite coordinate; duplicate point id "a"; line "l" references missing point "x"; pile references missing point "z"; constraint "c" references missing point "q"',
    );
  });
});
