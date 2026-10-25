import { describe, expect, it } from 'vitest';
import { sampleDocument } from './fixtures';
import { exportPointsCSV, fromPointsCSV, toPointsCSV } from './index';

describe('survey point CSV', () => {
  const doc = sampleDocument();

  it('writes PENZD in metres with 0.1 mm resolution', () => {
    const lines = toPointsCSV(doc).split('\n');
    expect(lines[0]).toBe('Point,Easting,Northing,Elevation,Description');
    expect(lines[1]).toBe('P1,0.0000,0.0000,0,pile');
    expect(lines[9]).toBe('F,0.7071,0.7071,0,');
    expect(exportPointsCSV(doc).warnings).toEqual(['5 line(s) and 18 constraint(s) dropped — a point list has points only']);
  });

  it('round-trips names and positions (to 0.1 mm)', () => {
    const back = fromPointsCSV(toPointsCSV(doc));
    expect(back.warnings).toEqual([]);
    expect(back.document.points.map((p) => [p.label, p.x, p.y])).toEqual(
      doc.points.map((p) => [p.label ?? p.id, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]),
    );
  });

  it('reads PNEZD, semicolons, quotes, no header, millimetres', () => {
    const r = fromPointsCSV('"P;1";2000;1000;0;pile\nP2;2500.5;1500;0;\n', { order: 'PNEZD', unit: 'mm' });
    expect(r.document.points).toEqual([
      { id: 'p1', x: 1000, y: 2000, label: 'P;1' },
      { id: 'p2', x: 1500, y: 2500.5, label: 'P2' },
    ]);
  });

  it('skips rows without coordinates', () => {
    expect(fromPointsCSV('Point,E,N\nA,1,2\nB,,\n').warnings).toEqual(['row 3 has no coordinates — skipped']);
  });
});
