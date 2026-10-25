import { describe, expect, it } from 'vitest';
import { sampleDocument } from './fixtures';
import { autoScale, exportSVG, toSVG, type InteropDocument } from './index';

const doc: InteropDocument = {
  units: 'mm',
  name: 'Pad <1>',
  points: [
    { id: 'a', x: 0, y: 0, label: 'P1' },
    { id: 'b', x: 5000, y: 2000 },
  ],
  lines: [
    { id: 'l', a: 'a', b: 'b' },
    { id: 'k', a: 'b', b: 'a', construction: true },
  ],
  constraints: [],
  piles: [{ point: 'a', head: 400, diameter: 300 }],
};

describe('toSVG', () => {
  it('picks the smallest standard scale that fits A4 landscape', () => {
    expect(autoScale(12192, 2438, { width: 277, height: 190 })).toBe(50);
    expect(autoScale(100, 50, { width: 277, height: 190 })).toBe(1);
    expect(autoScale(1e9, 1, { width: 277, height: 190 })).toBe(3610109);
  });

  it('draws to scale in paper millimetres with Y up', () => {
    const svg = toSVG(doc, { scale: 50, margin: 10, labels: false, caption: false });
    // extent incl. the pile head: 5200 × 2200 mm → 104 × 44 mm at 1:50, + 2 × 10 mm margin
    expect(svg).toContain('width="124mm" height="64mm" viewBox="0 0 124 64" data-scale="50"');
    // a(0,0) is bottom-left: x = 10 + 200/50, y = 10 + (2000 − 0)/50
    expect(svg).toContain('<line x1="14" y1="50" x2="114" y2="10"/>');
    expect(svg).toContain('<rect x="10" y="46" width="8" height="8"/><circle cx="14" cy="50" r="3"/>');
    expect(svg).toContain('<g class="construction"><line x1="114" y1="10" x2="14" y2="50"/></g>');
  });

  it('labels points and captions the drawing, escaping text', () => {
    const svg = toSVG(doc);
    expect(svg).toContain('<title>Pad &lt;1&gt;</title>');
    expect(svg).toMatch(/<g class="labels"><text [^>]*>P1<\/text><\/g>/);
    expect(svg).toContain('>Pad &lt;1&gt; · 1:20 · mm</text>');
  });

  it('omits construction on request and accepts a custom stylesheet', () => {
    const svg = toSVG(doc, { construction: false, css: '.sketch line{stroke:red}' });
    expect(svg).not.toContain('class="construction"');
    expect(svg).toContain('<style>.sketch line{stroke:red}</style>');
  });

  it('notes that constraints are not drawn, and rejects a bad scale', () => {
    expect(exportSVG(sampleDocument()).warnings).toEqual(['18 constraint(s) not drawn']);
    expect(() => toSVG(doc, { scale: 0 })).toThrow(RangeError);
  });
});
