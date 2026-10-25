/**
 * Checks against real CAD software, skipped unless the tools are named in the environment:
 *
 *   SOLVESPACE_CLI=/path/to/solvespace-cli   (SolveSpace ≥ 3.1, built with -DENABLE_CLI=ON)
 *   FREECADCMD=/path/to/freecadcmd           (FreeCAD ≥ 1.0, e.g. from the extracted AppImage)
 *   EZDXF_PYTHON=/path/to/python             (a Python with `pip install ezdxf`)
 *
 *   SOLVESPACE_CLI=… FREECADCMD=… EZDXF_PYTHON=… pnpm vitest run packages/interop
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonical, sampleDocument } from './fixtures';
import { fromSLVS, toDXF, toFCStd, toSLVS, toSLVSBytes, type InteropDocument } from './index';
import { parseRecords, slvsText } from './slvs-format';

const { SOLVESPACE_CLI, FREECADCMD, EZDXF_PYTHON } = process.env;
const script = (name: string) => fileURLToPath(new URL(`../scripts/${name}`, import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), 'interop-'));
const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };

const doc = sampleDocument();
/** The sample with every point nudged by a few mm: the CAD solver must pull them back. */
const nudged: InteropDocument = {
  ...doc,
  points: doc.points.map((p, i) => ({ ...p, x: p.x + ((i * 7) % 11) - 5, y: p.y + ((i * 5) % 7) - 3 })),
};

describe.skipIf(!SOLVESPACE_CLI)('SolveSpace (solvespace-cli)', () => {
  const regenerate = (bytes: Uint8Array): string => {
    const file = join(tmp(), 'sketch.slvs');
    writeFileSync(file, bytes);
    const log = execFileSync(SOLVESPACE_CLI!, ['regenerate', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    expect(log).not.toMatch(/Error/);
    return slvsText(readFileSync(file));
  };

  it('loads and re-saves our file unchanged (same records and fields, values to 1e-9)', () => {
    const ours = parseRecords(toSLVS(doc));
    const theirs = parseRecords(regenerate(toSLVSBytes(doc)));
    expect(theirs.map((r) => r.kind)).toEqual(ours.map((r) => r.kind));
    theirs.forEach((r, i) => {
      const mine = ours[i]!.fields;
      for (const key of new Set([...r.fields.keys(), ...mine.keys()])) {
        const a = r.fields.get(key) ?? '0';
        const b = mine.get(key) ?? '0';
        if (a !== b) expect(Math.abs(Number(a) - Number(b)), `${r.kind} ${i} ${key}: ${a} vs ${b}`).toBeLessThan(1e-9);
      }
    });
  });

  it('solves the nudged sketch back onto the designed positions', () => {
    const solved = fromSLVS(regenerate(toSLVSBytes(nudged))).document;
    solved.points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(doc.points[i]!.x, 6);
      expect(p.y).toBeCloseTo(doc.points[i]!.y, 6);
    });
    const rename = (id: string) => `p${doc.points.findIndex((p) => p.id === id) + 1}`;
    expect(solved.constraints.map((c) => canonical(c, (id) => id))).toEqual(doc.constraints.map((c) => canonical(c, rename)));
  });

  it('imports a file it has regenerated', () => {
    const r = fromSLVS(regenerate(toSLVSBytes(doc)));
    expect(r.warnings).toEqual([]);
    expect(r.document.piles).toHaveLength(5);
  });
});

describe.skipIf(!FREECADCMD)('FreeCAD (freecadcmd)', () => {
  interface Report {
    sketches: {
      solve: number;
      conflicting: number[];
      redundant: number[];
      malformed: number[];
      fullyConstrained: boolean;
      geometry: { kind: string; x?: number; y?: number; construction: boolean }[];
      constraints: unknown[];
    }[];
  }
  const check = (bytes: Uint8Array): Report => {
    const dir = tmp();
    writeFileSync(join(dir, 'sketch.FCStd'), bytes);
    execFileSync(FREECADCMD!, [script('freecad-check.py')], {
      env: { ...env, FCSTD: join(dir, 'sketch.FCStd'), REPORT: join(dir, 'report.json') },
      stdio: 'ignore',
    });
    return JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as Report;
  };

  it('opens the sketch: solved, fully constrained, nothing conflicting, redundant or malformed', () => {
    const s = check(toFCStd(doc)).sketches[0]!;
    expect([s.solve, s.conflicting, s.redundant, s.malformed, s.fullyConstrained]).toEqual([0, [], [], [], true]);
    expect(s.geometry.filter((g) => g.kind === 'point').map((g) => [g.x, g.y])).toEqual(doc.points.map((p) => [p.x, p.y]));
    expect(s.geometry.filter((g) => g.kind === 'line')).toHaveLength(8);
  });

  it('solves the nudged sketch back (except the ratio point, exported as a fixed distance)', () => {
    const s = check(toFCStd(nudged)).sketches[0]!;
    expect(s.solve).toBe(0);
    const pts = s.geometry.filter((g) => g.kind === 'point');
    doc.points.forEach((p, i) => {
      if (p.id === 'R') return;
      expect(pts[i]!.x).toBeCloseTo(p.x, 6);
      expect(pts[i]!.y).toBeCloseTo(p.y, 6);
    });
  });

  it('imports our DXF with its layers, points, lines, pile squares and circles', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'plan.dxf'), toDXF(doc));
    execFileSync(FREECADCMD!, [script('freecad-dxf.py')], {
      env: { ...env, DXF: join(dir, 'plan.dxf'), REPORT: join(dir, 'r.json') },
      stdio: 'ignore',
    });
    const r = JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8')) as { layers: string[]; shapes: { edges: number; vertexes: number }[] };
    expect(r.layers).toEqual(['0', 'SKETCH', 'CONSTRUCTION', 'PILES', 'LABELS']);
    const kinds = r.shapes.map((s) => (s.edges === 0 ? 'point' : s.edges === 4 ? 'square' : s.vertexes === 1 ? 'circle' : 'line'));
    expect(['point', 'line', 'square', 'circle'].map((k) => kinds.filter((x) => x === k).length)).toEqual([11, 5, 5, 4]);
  });
});

describe.skipIf(!EZDXF_PYTHON)('ezdxf audit', () => {
  it('finds no errors in our DXF R12', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'plan.dxf'), toDXF(doc));
    const out = JSON.parse(
      execFileSync(EZDXF_PYTHON!, ['-I', script('dxf-audit.py'), join(dir, 'plan.dxf')], { encoding: 'utf8', env }),
    ) as {
      version: string;
      errors: string[];
      fixes: string[];
      entities: Record<string, number>;
    };
    expect([out.version, out.errors, out.fixes]).toEqual(['AC1009', [], []]);
    expect(out.entities).toEqual({
      'POINT:SKETCH': 11,
      'LINE:SKETCH': 4,
      'LINE:CONSTRUCTION': 1,
      'POLYLINE:PILES': 5,
      'CIRCLE:PILES': 4,
      'TEXT:LABELS': 5,
    });
  });
});
