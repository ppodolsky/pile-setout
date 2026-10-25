'use strict';

/* ============================== containers ============================== */
const CONTAINERS = {
  '10': { label: "10'", L: 2991,  cast: 102   },
  '20': { label: "20'", L: 6058,  cast: 102.5, mid: 3029, pockets: true },
  '40': { label: "40'", L: 12192, cast: 103.5, mids: [3048, 9144] },
};
const CONTAINER_W = 2438;

/** Allowed range for the pile head side and inset, mm. */
const HEAD_RANGE = [50, 1000];
const INSET_RANGE = [0, 500];

/**
 * Builds the pile field for a sequence of containers joined end to end (short sides touching).
 *
 * Every pile has the same square head, `head` mm per side. `inset` is the distance from the
 * container's outer edge (the string line) to the outer side of the head; 0 = head flush with
 * the edge. So a corner pile's centre sits `inset + head/2` in from the end and from the long side.
 * At every joint the two neighbouring containers share ONE pile centred on the joint line.
 */
function buildField(types, head, inset) {
  const outline = [];
  const cols = []; // pile columns along the field: {x, shared}
  const e = inset + head / 2; // pile centre from a container end / long side
  let x0 = 0;
  types.forEach((t, k) => {
    const c = CONTAINERS[t];
    const next = types[k + 1];
    if (k === 0) cols.push({ x: e });
    for (const m of [c.mid, ...(c.mids || [])]) if (m) cols.push({ x: x0 + m });
    if (next) cols.push({ x: x0 + c.L, shared: true });
    else cols.push({ x: x0 + c.L - e });
    outline.push({ x0, L: c.L, W: CONTAINER_W, cast: c.cast, pockets: !!c.pockets });
    x0 += c.L;
  });
  cols.sort((a, b) => a.x - b.x);
  const piles = [];
  for (const y of [e, CONTAINER_W - e]) for (const col of cols)
    piles.push({ label: '', x: col.x, y, shared: !!col.shared });
  piles.forEach((p, i) => p.label = 'C' + (i + 1));
  return { piles, outline };
}

/** Standard measurement set for a two-row field: chains, cross ties, both diagonals of every bay. */
function defaultMeas(piles) {
  const rows = [[], []];
  const ys = [...new Set(piles.map(p => p.y))].sort((a, b) => a - b);
  for (const y of ys) {
    const row = piles.filter(p => p.y === y).sort((a, b) => a.x - b.x);
    (y === ys[0] ? rows[0] : rows[1]).push(...row);
  }
  if (!rows[0].length) return [];
  const bot = rows[0], top = rows[1];
  const edges = [];
  for (const row of rows) for (let i = 0; i + 1 < row.length; i++)
    edges.push([row[i].label, row[i + 1].label]);
  // full row lengths and long diagonals — redundancy for catching blunders
  for (const row of rows) if (row.length > 2)
    edges.push([row[0].label, row[row.length - 1].label]);
  if (bot.length > 2) {
    edges.push([bot[0].label, top[top.length - 1].label]);
    edges.push([bot[bot.length - 1].label, top[0].label]);
  }
  for (let i = 0; i < bot.length; i++) edges.push([bot[i].label, top[i].label]);
  for (let i = 0; i + 1 < bot.length; i++) {
    edges.push([bot[i].label, top[i + 1].label]);
    edges.push([bot[i + 1].label, top[i].label]);
  }
  return edges.map(([a, b]) => ({ a, b, value: null }));
}

const PRESETS = {
  c10:    { types: ['10'], name: "10' container",
            hint: "4 corner piles." },
  c20:    { types: ['20'], name: "20' container",
            hint: "4 corner piles plus a middle pair under the side rails (3029 mm)." },
  c40:    { types: ['40'], name: "40' container",
            hint: "4 corner piles plus two intermediate pairs under the side rails at the quarter points (3048 / 9144 mm)." },
  combo:  { types: null, name: "Container combination (builder)",
            hint: "Containers joined end to end. Each joint sits on one shared pile centred on the joint line, carrying the corner castings of both containers." },
};

/* ============================== state ============================== */
function defaultState() {
  return {
    piles: [],           // [{label, x, y, shared?}] — design
    outline: [],         // [{x0, L, W, cast, pockets}] — container outlines
    meas: [],            // [{a, b, value, corr, end}] — tape reading, hook correction and its end ('a' | 'b')
    head: 200,           // square pile head side, mm
    inset: 0,            // container edge → outer side of the head, mm
    tol: 3,
    exagg: 10,
    showEdges: true,
    preset: 'c20',
    containers: ['10', '20'],  // for the combination builder
    pinned: new Set(),         // "pinned" reference piles
  };
}
const state = defaultState();

/* ============================== persistence ============================== */
const STORAGE_KEY = 'pile-setout/v1';

/** Saves everything the user entered to this browser; called after every recalculation. */
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      preset: state.preset, containers: state.containers, head: state.head, inset: state.inset,
      piles: state.piles, meas: state.meas, tol: state.tol, exagg: state.exagg,
      showEdges: state.showEdges, pinned: [...state.pinned],
    }));
  } catch (_) { /* storage full or disabled — the app still works, just without persistence */ }
}

/** Restores a saved session; returns false (leaving defaults) if there is none or it is malformed. */
function loadState() {
  let d;
  try { d = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) { return false; }
  const num = v => typeof v === 'number' && Number.isFinite(v);
  const numOrNull = v => v === null || num(v);
  if (!d || !PRESETS[d.preset] || !Array.isArray(d.piles) || !Array.isArray(d.meas)) return false;
  if (!Array.isArray(d.containers) || !d.containers.every(t => CONTAINERS[t])) return false;
  if (!d.piles.every(p => p && typeof p.label === 'string' && num(p.x) && num(p.y))) return false;
  if (!d.meas.every(m => m && typeof m.a === 'string' && typeof m.b === 'string' &&
      numOrNull(m.value) && numOrNull(m.corr ?? null))) return false;
  Object.assign(state, {
    preset: d.preset,
    containers: d.containers,
    head: num(d.head) ? d.head : 200,
    inset: num(d.inset) ? d.inset : 0,
    piles: d.piles.map(p => ({ label: p.label, x: p.x, y: p.y, shared: !!p.shared })),
    meas: d.meas.map(m => ({ a: m.a, b: m.b, value: m.value, corr: m.corr ?? null, end: m.end === 'b' ? 'b' : 'a' })),
    tol: num(d.tol) && d.tol >= 0.5 ? d.tol : 3,
    exagg: num(d.exagg) ? d.exagg : 10,
    showEdges: d.showEdges !== false,
    pinned: new Set(Array.isArray(d.pinned) ? d.pinned.filter(l => typeof l === 'string') : []),
  });
  // outlines are derived from the containers; piles stay as saved (they may have been hand-edited)
  state.outline = buildField(PRESETS[state.preset].types || state.containers, state.head, state.inset).outline;
  return true;
}

/** Puts the state values into the form controls (after loading or resetting). */
function syncControls() {
  $('#preset').value = state.preset;
  $('#presetHint').textContent = PRESETS[state.preset].hint;
  $('#head').value = state.head;
  $('#inset').value = state.inset;
  $('#tol').value = state.tol;
  $('#exagg').value = state.exagg;
  $('#exaggVal').textContent = state.exagg;
  $('#edges').checked = state.showEdges;
  for (const id of ['#head', '#inset']) $(id).classList.remove('invalid');
}

function applyPreset(key) {
  state.preset = key;
  $('#presetHint').textContent = PRESETS[key].hint;
  state.pinned = new Set();
  rebuildField(false);
}

function rebuildCombo() {
  rebuildField(false);
}

/**
 * Regenerates the design piles from the preset, head size and inset.
 * With `keepMeas` the entered measurements survive when the pile labels are unchanged
 * (head/inset edits move the piles but keep the same set).
 */
function rebuildField(keepMeas) {
  const types = PRESETS[state.preset].types || state.containers;
  const built = buildField(types, state.head, state.inset);
  const labels = new Set(built.piles.map(p => p.label));
  const keep = keepMeas && state.meas.every(m => labels.has(m.a) && labels.has(m.b));
  state.piles = built.piles;
  state.outline = built.outline;
  if (!keep) state.meas = [];
  renderComboBar();
  renderCoords();
  renderMeas();
  renderResults();
}

/* ============================== utils ============================== */
const $ = s => document.querySelector(s);
function fmt(v, digits = 1) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
function sfmt(v, digits = 1) {
  return (v >= 0 ? '+' : '−') + fmt(Math.abs(v), digits);
}
function parseNum(s) {
  const v = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function dist(p, q) { return Math.hypot(p.x - q.x, p.y - q.y); }
function plural(n, one, other) { return n === 1 ? one : other; }
/** Single "this pile must move" predicate — same threshold as the coverage search
 *  (working radius = tolerance + 0.05 mm plus a tiny fp slack).
 *  The offset is computed from the same q/t as the search score — bit for bit. */
function needsMove(mag) { return mag > state.tol + 0.05 + 1e-9; }

/* ============================== linear algebra ============================== */
function solveLin(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) M[piv][col] = 1e-12;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

function matrixRank(A, eps) {
  const n = A.length;
  const M = A.map(r => [...r]);
  let rank = 0, row = 0;
  for (let col = 0; col < n && row < n; col++) {
    let piv = -1, best = -1;
    for (let r = row; r < n; r++) if (Math.abs(M[r][col]) > best) { best = Math.abs(M[r][col]); piv = r; }
    if (piv < 0 || best < eps) continue;
    [M[row], M[piv]] = [M[piv], M[row]];
    for (let r = row + 1; r < n; r++) {
      const f = M[r][col] / M[row][col];
      if (f !== 0) for (let c = col; c < n; c++) M[r][c] -= f * M[row][c];
    }
    row++; rank++;
  }
  return rank;
}

/* ============================== least-squares trilateration ============================== */
/**
 * Distance between the two nails: the tape reading minus the correction. The correction is the
 * fixed extra length when the tape is hooked on a point behind one end's pile (it belongs to that end).
 */
function measLength(m) {
  if (m.value == null) return null;
  return m.value - (m.corr ?? 0);
}

function validMeas(design, meas) {
  const labels = new Set(design.map(p => p.label));
  return meas.filter(m =>
    labels.has(m.a) && labels.has(m.b) && m.a !== m.b && m.value != null && measLength(m) > 0
  );
}

function fit(design, meas) {
  const n = design.length;
  if (!n) return null;
  const idx = new Map(design.map((p, i) => [p.label, i]));
  const used = validMeas(design, meas);
  if (!used.length) return null;

  const pos = design.map(p => [p.x, p.y]);
  const lam = 1e-3;
  for (let iter = 0; iter < 6; iter++) {
    const A = Array.from({ length: 2 * n }, () => new Array(2 * n).fill(0));
    const b = new Array(2 * n).fill(0);
    for (const m of used) {
      const i = idx.get(m.a), j = idx.get(m.b);
      const dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1];
      const d0 = Math.hypot(dx, dy);
      if (d0 < 1e-9) continue;
      const ux = dx / d0, uy = dy / d0, r = measLength(m) - d0;
      const rows = [[2 * i, ux], [2 * i + 1, uy], [2 * j, -ux], [2 * j + 1, -uy]];
      for (const [r1, c1] of rows) for (const [r2, c2] of rows) A[r1][r2] += c1 * c2;
      for (const [ri, ci] of rows) b[ri] += ci * r;
    }
    for (let k = 0; k < 2 * n; k++) A[k][k] += lam;
    const delta = solveLin(A, b);
    let step = 0;
    for (let i = 0; i < n; i++) {
      pos[i][0] += delta[2 * i]; pos[i][1] += delta[2 * i + 1];
      step = Math.max(step, Math.hypot(delta[2 * i], delta[2 * i + 1]));
    }
    if (step < 1e-7) break;
  }

  const residuals = used.map(m => {
    const i = idx.get(m.a), j = idx.get(m.b);
    const dFit = Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1]);
    const dDesign = dist(design[i], design[j]);
    const len = measLength(m);
    return { a: m.a, b: m.b, value: len, reading: m.value, corr: m.corr ?? 0, dFit, dDesign, delta: len - dDesign, fitErr: len - dFit };
  });
  const rms = Math.sqrt(residuals.reduce((s, r) => s + r.fitErr * r.fitErr, 0) / residuals.length);
  return { pos, residuals, rms, used };
}

/** Numerical rank of the measurement system (no regularisation): is the field fully determined? */
function rigidityRank(design, used) {
  const n = design.length;
  const idx = new Map(design.map((p, i) => [p.label, i]));
  const A = Array.from({ length: 2 * n }, () => new Array(2 * n).fill(0));
  for (const m of used) {
    const i = idx.get(m.a), j = idx.get(m.b);
    const dx = design[i].x - design[j].x, dy = design[i].y - design[j].y;
    const d0 = Math.hypot(dx, dy);
    if (d0 < 1e-9) continue;
    const ux = dx / d0, uy = dy / d0;
    const rows = [[2 * i, ux], [2 * i + 1, uy], [2 * j, -ux], [2 * j + 1, -uy]];
    for (const [r1, c1] of rows) for (const [r2, c2] of rows) A[r1][r2] += c1 * c2;
  }
  return matrixRank(A, 1e-6);
}

/* ============================== reference frame alignment ============================== */
/**
 * Pile-to-pile measurements cannot see a rigid motion of the whole field.
 * We look for the rigid placement of the design field (rotation + shift) that puts the
 * largest number of piles within tolerance already — that is the minimum number of moves.
 * For each angle, "a point inside the most tolerance circles" is solved exactly
 * (candidates are the circle centres and their pairwise intersections). Rotation only, no scaling.
 *
 * Stages: angle grid around 0 and around pair directions → local refinement by step halving →
 * proof of optimality by branching on the angle: for an interval [lo,hi] an upper bound on
 * coverage is the exact solution with circles inflated by Lmax·(hi−lo)/2; if the bound does not
 * exceed the record, the interval is pruned. Running out of budget is reported honestly as "not verified".
 */
function placementSearch(design, pos, tol, pinned) {
  const n = design.length;
  const F = pos.map(p => ({ x: p[0], y: p[1] }));
  const r = tol + 0.05; // single working radius — same as needsMove()
  if (!n) return null;

  // rotate about the centroid of the design field (keeps the branching upper bound valid:
  // a point moves by at most |D_i − D_c|·Δθ under rotation)
  const dcx = design.reduce((s, p) => s + p.x, 0) / n;
  const dcy = design.reduce((s, p) => s + p.y, 0) / n;
  const Lmax = Math.max(...design.map(p => Math.hypot(p.x - dcx, p.y - dcy)));

  // tolerance circle centres in shift space: q_i = F_i − D_c − R(θ)·(D_i − D_c)
  const qCenters = (a) => {
    const R = [Math.cos(a), Math.sin(a)];
    return F.map((f, i) => ({
      x: f.x - dcx - (R[0] * (design[i].x - dcx) - R[1] * (design[i].y - dcy)),
      y: f.y - dcy - (R[1] * (design[i].x - dcx) + R[0] * (design[i].y - dcy)),
    }));
  };

  // candidate shifts: centres + pairwise intersections of circles of radius rr.
  // The exact score passes the true radius r; the conservative upper bound uses the
  // outward-rounded rrB for both generation and checking, so the bound can only overestimate.
  const shiftCandidates = (q, rr) => {
    const ts = q.map(p => ({ x: p.x, y: p.y }));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = q[j].x - q[i].x, dy = q[j].y - q[i].y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-9 || d > 2 * rr) continue;
      const a0 = d / 2, h = Math.sqrt(Math.max(0, rr * rr - a0 * a0));
      const ux = dx / d, uy = dy / d;
      const mx = q[i].x + ux * a0, my = q[i].y + uy * a0;
      ts.push({ x: mx - uy * h, y: my + ux * h }, { x: mx + uy * h, y: my - ux * h });
    }
    return ts;
  };

  let best = null;
  const evalAngle = (a) => {
    const R = [Math.cos(a), Math.sin(a)];
    const q = qCenters(a);
    for (const t of shiftCandidates(q, r)) {
      let out = 0, msq = 0, pinBad = false;
      for (let i = 0; i < n; i++) {
        const m = Math.hypot(q[i].x - t.x, q[i].y - t.y);
        if (m > r + 1e-9) { // +1e-9: intersection candidates lie on the circle boundary — fp noise must not drop them
          out++; msq += m * m;
          if (pinned.has(design[i].label)) pinBad = true;
        }
      }
      const score = pinBad ? -1 : n - out;
      if (!best || score > best.score || (score === best.score && msq < best.msq)) {
        best = { a, R, t, score, msq, pinBad };
      }
    }
  };

  const finish = () => {
    if (!best) return null;
    // correction = where to move the pile: from its actual position to the design position.
    // Computed from THE SAME stored q and t as the coverage score in the search
    // (e = t − q_i) so the offset is bit-identical to the scored one —
    // otherwise the move list and the coverage count disagree at the tolerance boundary.
    const q = qCenters(best.a);
    const e = q.map((qi, i) => {
      const dx = best.t.x - qi.x, dy = best.t.y - qi.y;
      return {
        label: design[i].label, dx, dy,
        mag: Math.hypot(qi.x - best.t.x, qi.y - best.t.y),
      };
    });
    return { ...best, e, dcx, dcy };
  };

  // ---- stage 1: grid around 0 and around pair directions ----
  const baseThetas = [0];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a1 = Math.atan2(design[j].y - design[i].y, design[j].x - design[i].x);
    const a2 = Math.atan2(F[j].y - F[i].y, F[j].x - F[i].x);
    baseThetas.push(a2 - a1);
  }
  const thetas = new Set();
  const baseStep = 0.05 * Math.PI / 180;
  const add = t => thetas.add(Math.round(t / 1e-9) * 1e-9);
  for (const b of baseThetas) for (let d = -6; d <= 6; d++) add(b + d * baseStep);
  for (const a of thetas) evalAngle(a);

  // ---- stage 2: local refinement (halve the step while it improves) ----
  if (best) {
    let step = baseStep;
    for (let round = 0; round < 6 && step > 4e-5; round++) {
      step /= 2;
      let improved = false;
      for (const d of [-2, -1, 1, 2]) {
        const prev = best;
        evalAngle(best.a + d * step);
        if (best !== prev) improved = true;
      }
      if (!improved) break;
    }
  }

  // ---- stage 3: proof of optimality by branching on the angle ----
  const verify = (budget) => {
    if (!best) return { proven: true };
    const stack = [[-Math.PI, Math.PI]];
    let left = budget;
    while (stack.length) {
      if (left-- <= 0) return { proven: false };
      const [lo, hi] = stack.pop();
      const mid = (lo + hi) / 2;
      evalAngle(mid); // the exact score at the midpoint may improve the record
      const q = qCenters(mid);
      // upper bound on coverage over the whole interval: circles inflated by Lmax·(hi−lo)/2.
      // The bound radius is rounded outward — the bound can only overestimate,
      // so an interval is never pruned wrongly.
      const rr = r + Lmax * (hi - lo) / 2;
      const rrB = rr + Math.max(1e-6, rr * 1e-9);
      let bound = 0;
      for (const t of shiftCandidates(q, rrB)) {
        let cov = 0;
        for (let i = 0; i < n; i++) if (Math.hypot(q[i].x - t.x, q[i].y - t.y) <= rrB + 1e-9) cov++;
        if (cov > bound) bound = cov;
      }
      if (bound <= best.score) continue; // this interval cannot beat the record
      if (hi - lo < 1e-7) return { proven: false };
      stack.push([lo, mid], [mid, hi]);
    }
    return { proven: true };
  };

  return { getBest: () => best, finish, verify, evalAngle };
}

/** Full search: grid + refinement + proof (within budget). */
function bestPlacement(design, pos, tol, pinned) {
  const s = placementSearch(design, pos, tol, pinned);
  if (!s) return null;
  return s.finish();
}

/* ============================== calculation pipeline ============================== */
/**
 * Lower bound on the number of moves: if the actual distance of a pair differs from the
 * design distance by more than 2r, at least one pile of the pair must move
 * (two piles that stay within tolerance r change their distance by at most 2r).
 * Minimum moves ≥ minimum vertex cover of the conflicting-pair graph.
 */
function moveLowerBound(design, fit, r) {
  const idx = new Map(design.map((p, i) => [p.label, i]));
  const edges = [];
  for (const res of fit.residuals) {
    if (Math.abs(res.dFit - res.dDesign) > 2 * r)
      edges.push([idx.get(res.a), idx.get(res.b)]);
  }
  const n = design.length;
  if (!edges.length) return 0;
  if (n > 20) return null; // field too large for subset enumeration
  for (let k = 1; k < n; k++) {
    const cover = (start, chosen) => {
      if (chosen.length === k) {
        const s = new Set(chosen);
        return edges.every(([a, b]) => s.has(a) || s.has(b));
      }
      for (let v = start; v < n; v++) {
        chosen.push(v);
        if (cover(v + 1, chosen)) return true;
        chosen.pop();
      }
      return false;
    };
    if (cover(0, [])) return k;
  }
  return n;
}

function computeFit() {
  const design = state.piles;
  const f = fit(design, state.meas);
  if (!f) return { status: 'empty' };
  const need = 2 * design.length - 3;
  const rank = rigidityRank(design, f.used);
  if (rank < need) {
    return { status: 'under', fit: f, need, rank };
  }
  if (f.rms > Math.max(1.5, state.tol) ||
      f.residuals.some(r => Math.abs(r.fitErr) > Math.max(3 * state.tol, 5))) {
    return { status: 'contradictory', fit: f };
  }
  const search = placementSearch(design, f.pos, state.tol, state.pinned);
  if (!search) return { status: 'empty', fit: f };
  // optimality proof with a budget that depends on field size
  const budget = Math.round(Math.min(5000, Math.max(800, 300000 / (design.length * design.length))));
  const ver = search.verify(budget);
  const best = search.finish();
  if (!best) return { status: 'empty', fit: f };
  if (best.pinBad) return { status: 'pinconflict', fit: f, align: best };
  // how many moves it would take without pins — for the warning
  const free = state.pinned.size
    ? bestPlacement(design, f.pos, state.tol, new Set())
    : null;
  const lb = moveLowerBound(design, f, state.tol + 0.05);
  // move order: largest correction first; step numbers are shared by the plan and the cards
  const moves = best.e.filter(c => needsMove(c.mag)).sort((a, b) => b.mag - a.mag);
  const steps = new Map(moves.map((m, i) => [m.label, i + 1]));
  return { status: 'ok', fit: f, align: best, free, lb, proven: ver.proven, moves, steps };
}

/* ============================== render: coordinates ============================== */
function renderPresetSelect() {
  const sel = $('#preset');
  sel.innerHTML = Object.entries(PRESETS)
    .map(([k, p]) => `<option value="${k}">${esc(p.name)}</option>`).join('');
  sel.value = state.preset;
}

function renderCoords() {
  const tb = $('#coords tbody');
  tb.innerHTML = state.piles.map((p, i) => `
    <tr>
      <td><input type="text" data-i="${i}" data-f="label" value="${esc(p.label)}" aria-label="Pile ${i + 1}"></td>
      <td><input type="number" step="0.5" data-i="${i}" data-f="x" value="${p.x}" aria-label="X of pile ${i + 1}"></td>
      <td><input type="number" step="0.5" data-i="${i}" data-f="y" value="${p.y}" aria-label="Y of pile ${i + 1}"></td>
      <td><button class="del" data-i="${i}" title="Delete pile" aria-label="Delete ${esc(p.label)}">×</button></td>
    </tr>`).join('');
}

function renderComboBar() {
  const bar = $('#comboBar');
  bar.hidden = state.preset !== 'combo';
  bar.innerHTML = `
    <div class="combo-btns">
      <button class="ghost" data-add="10">+ 10'</button>
      <button class="ghost" data-add="20">+ 20'</button>
      <button class="ghost" data-add="40">+ 40'</button>
      <button class="ghost" id="comboClear">clear</button>
    </div>
    <div class="combo-chips">${state.containers.map((t, i) =>
      `<span class="chip">${CONTAINERS[t].label}<button data-rm="${i}" title="Remove">×</button></span>`).join('')
      || '<span class="hint" style="margin:0">Add containers — they are joined end to end along the short side; each joint sits on one shared pile.</span>'}</div>`;
}

/* ============================== render: measurements ============================== */
function pairOptions(sel) {
  return state.piles.map(p => `<option value="${esc(p.label)}" ${p.label === sel ? 'selected' : ''}>${esc(p.label)}</option>`).join('');
}

function renderMeas() {
  const wrap = $('#measRows');
  if (!state.meas.length) {
    wrap.innerHTML = '<p class="hint" style="margin:0 0 var(--space-3)">No measurements yet. Start with the suggestion above, or “+ add measurement” — change the piles if you measured something else.</p>';
    return;
  }
  wrap.innerHTML = state.meas.map((m, i) => {
    const endBtn = end => `<button type="button" class="${m.end === end ? 'on' : ''}" data-i="${i}" data-end="${end}" aria-pressed="${m.end === end}">${esc(m[end])}</button>`;
    return `
    <div class="meas-row">
      <div class="meas-main">
        <select data-i="${i}" data-f="a" aria-label="Measurement ${i + 1}, first pile">${pairOptions(m.a)}</select>
        <select data-i="${i}" data-f="b" aria-label="Measurement ${i + 1}, second pile">${pairOptions(m.b)}</select>
        <input type="number" inputmode="decimal" step="0.5" placeholder="reading" data-i="${i}" data-f="value" value="${m.value ?? ''}" aria-label="Measurement ${i + 1}, tape reading, mm">
        <span class="delta" data-delta="${i}"></span>
        <button class="del" data-i="${i}" title="Delete measurement" aria-label="Delete measurement ${i + 1}">×</button>
      </div>
      <div class="meas-corr ${m.corr ? 'set' : ''}">
        <span><span class="lbl-long">− correction</span><span class="lbl-short">− corr.</span></span>
        <input type="number" inputmode="decimal" step="0.5" min="0" placeholder="0" data-i="${i}" data-f="corr" value="${m.corr ?? ''}" aria-label="Measurement ${i + 1}, correction to subtract, mm">
        <span>mm at</span>
        <span class="seg" role="group" aria-label="End the correction belongs to">${endBtn('a')}${endBtn('b')}</span>
        <span class="corr-eff" data-eff="${i}"></span>
      </div>
    </div>`;
  }).join('');
  state.meas.forEach((m, i) => updateRowBadge(i));
}

function updateRowBadge(i) {
  const el = document.querySelector(`[data-delta="${i}"]`);
  const eff = document.querySelector(`[data-eff="${i}"]`);
  if (!el) return;
  const m = state.meas[i];
  const len = measLength(m);
  if (eff) eff.textContent = m.corr && len != null ? `= ${fmt(len)}` : '';
  const a = state.piles.find(p => p.label === m.a);
  const b = state.piles.find(p => p.label === m.b);
  if (!a || !b || len == null) { el.textContent = ''; el.className = 'delta'; return; }
  const dv = len - dist(a, b);
  const cls = Math.abs(dv) <= state.tol ? 'ok' : Math.abs(dv) <= 3 * state.tol ? 'warn' : 'err';
  el.textContent = sfmt(dv);
  el.className = 'delta ' + cls;
}

/** The last correction entered for a pile (as the hooked end) in another measurement, if any. */
function knownCorr(label, exceptIndex) {
  for (let k = state.meas.length - 1; k >= 0; k--) {
    const m = state.meas[k];
    if (k !== exceptIndex && m.corr != null && m[m.end] === label) return m.corr;
  }
  return null;
}

/** Fills an empty correction from the same pile's correction in other measurements. */
function inheritCorr(i) {
  const m = state.meas[i];
  if (m.corr == null) m.corr = knownCorr(m[m.end], i);
}

function pairKey(a, b) { return [a, b].sort().join('|'); }

/** Pair for "+ add measurement": the advisor's suggestion, else the next unlisted recommended pair. */
function nextSuggestedPair() {
  const s = lastAdvice;
  if (s && s.a && s.i == null && (s.kind === 'fix' || s.kind === 'check')) return { a: s.a, b: s.b };
  const have = new Set(state.meas.map(m => pairKey(m.a, m.b)));
  const next = defaultMeas(state.piles).find(m => !have.has(pairKey(m.a, m.b)));
  return next ? { a: next.a, b: next.b } : { a: state.piles[0].label, b: state.piles[1].label };
}

/* ============================== what to measure next ============================== */
let lastAdvice = null;

/**
 * Picks the single most useful next measurement:
 * 1. re-measure a reading that contradicts the others;
 * 2. until the field is determined — the first pair (already-listed empty rows first, then the
 *    recommended set, then any pair by length) that raises the rigidity rank, i.e. adds information;
 * 3. then the rest of the recommended set as check measurements (they catch misread tapes).
 */
function suggestNext(res) {
  const design = state.piles;
  if (design.length < 2) return null;
  const labels = new Set(design.map(p => p.label));
  const byPair = new Map(); // pair → row index of an existing row without a reading
  state.meas.forEach((m, i) => {
    if (m.value == null && labels.has(m.a) && labels.has(m.b) && m.a !== m.b && !byPair.has(pairKey(m.a, m.b)))
      byPair.set(pairKey(m.a, m.b), i);
  });
  const rowOf = (a, b) => byPair.get(pairKey(a, b));

  if (res.status === 'contradictory') {
    const w = [...res.fit.residuals].sort((x, y) => Math.abs(y.fitErr) - Math.abs(x.fitErr))[0];
    const i = state.meas.findIndex(m => pairKey(m.a, m.b) === pairKey(w.a, w.b) && m.value != null);
    return { kind: 'remeasure', a: w.a, b: w.b, i: i < 0 ? null : i, err: w.fitErr };
  }

  const used = validMeas(design, state.meas);
  const need = 2 * design.length - 3;
  const rank = used.length ? rigidityRank(design, used) : 0;
  const done = new Set(used.map(m => pairKey(m.a, m.b)));
  const recommended = defaultMeas(design);
  const all = [];
  for (let i = 0; i < design.length; i++) for (let j = i + 1; j < design.length; j++)
    all.push({ a: design[i].label, b: design[j].label, d: dist(design[i], design[j]) });
  all.sort((x, y) => x.d - y.d);
  const pendingRows = state.meas.filter(m => byPair.has(pairKey(m.a, m.b)));
  const seen = new Set();
  const candidates = [...pendingRows, ...recommended, ...all].filter(c => {
    const k = pairKey(c.a, c.b);
    if (c.a === c.b || done.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const recDone = recommended.filter(c => done.has(pairKey(c.a, c.b))).length;
  const base = { rank, need, extra: used.length - rank, recDone, recTotal: recommended.length };

  if (rank < need) {
    for (const c of candidates) {
      if (rigidityRank(design, [...used, c]) > rank) return { ...base, kind: 'fix', a: c.a, b: c.b, i: rowOf(c.a, c.b) };
    }
  }
  const next = recommended.find(c => !done.has(pairKey(c.a, c.b)));
  if (next) return { ...base, kind: 'check', a: next.a, b: next.b, i: rowOf(next.a, next.b) };
  return { ...base, kind: 'done' };
}

/** Mini map of the field with the suggested pair joined by a line. */
function pairMap(piles, a, b) {
  const xs = piles.map(p => p.x), ys = piles.map(p => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const w = Math.max(Math.max(...xs) - x0, 1), h = Math.max(Math.max(...ys) - y0, 1);
  const W = 132, H = Math.max(28, Math.min(64, W * h / w));
  const pt = p => [8 + (p.x - x0) / w * (W - 16), 8 + (p.y - y0) / h * (H - 16)];
  const pa = piles.find(p => p.label === a), pb = piles.find(p => p.label === b);
  let s = `<svg class="next-map" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">`;
  s += `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="3" fill="#eceee9" stroke="#c9c6bf"/>`;
  if (pa && pb) {
    const [x1, y1] = pt(pa), [x2, y2] = pt(pb);
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#01696f" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  for (const p of piles) {
    const [x, y] = pt(p);
    const on = p === pa || p === pb;
    s += `<circle cx="${x}" cy="${y}" r="${on ? 4 : 2}" fill="${on ? '#01696f' : '#a3a6ac'}"/>`;
  }
  return s + `</svg>`;
}

function pairKind(a, b) {
  const pa = state.piles.find(p => p.label === a), pb = state.piles.find(p => p.label === b);
  if (!pa || !pb) return '';
  if (Math.abs(pa.y - pb.y) < 0.6) return 'along the row';
  if (Math.abs(pa.x - pb.x) < 0.6) return 'across';
  return 'diagonal';
}

function renderNext(res) {
  const box = $('#measNext');
  const s = suggestNext(res);
  lastAdvice = s;
  if (!s) { box.innerHTML = ''; return; }
  const progress = s.kind === 'remeasure' ? '' : s.rank < s.need
    ? `<span>Field fixed: <b>${s.rank}</b> / ${s.need}</span>`
    : `<span class="ok">Field fixed ✓ · ${s.extra} check${s.extra === 1 ? '' : 's'}</span>`;
  const bar = s.kind === 'remeasure' ? '' : `<div class="next-bar"><span style="width:${Math.min(100, 100 * s.rank / Math.max(s.need, 1))}%"></span></div>`;
  if (s.kind === 'done') {
    box.innerHTML = `<div class="next-box done"><div class="next-head"><span class="next-title">Next to measure</span>${progress}</div>
      <div class="next-why">All ${s.recTotal} recommended measurements are in. Follow the move plan; after moving a pile, re-measure its pairs and update the readings.</div></div>`;
    return;
  }
  const pa = state.piles.find(p => p.label === s.a), pb = state.piles.find(p => p.label === s.b);
  const d = pa && pb ? dist(pa, pb) : null;
  const left = s.need - s.rank;
  const why = {
    remeasure: `This reading doesn't fit the others (off by about <b>${sfmt(s.err)} mm</b>) — probably misread or mistyped. Measure it again before moving any pile.`,
    fix: `Adds new information about the field shape. ${left} more independent measurement${left === 1 ? '' : 's'} needed before the move plan can be computed.`,
    check: `The field is fixed. Optional check measurement — extra readings let the app spot a misread tape (recommended set: ${s.recDone} / ${s.recTotal}).`,
  }[s.kind];
  const action = s.i != null
    ? `<button class="next-btn" type="button" data-next-go="${s.i}">Go to row</button>`
    : `<button class="next-btn" type="button" data-next-add>Add</button>`;
  box.innerHTML = `<div class="next-box ${s.kind}">
    <div class="next-head"><span class="next-title">${s.kind === 'remeasure' ? 'Re-measure' : 'Next to measure'}</span>${progress}</div>
    ${bar}
    <div class="next-main">
      ${pairMap(state.piles, s.a, s.b)}
      <div class="next-pair">
        <b>${esc(s.a)} ↔ ${esc(s.b)}</b>
        <div class="next-kind">${pairKind(s.a, s.b)}</div>
        ${d != null ? `<div class="next-d">design ≈ ${fmt(d, 0)} mm</div>` : ''}
      </div>
      ${action}
    </div>
    <div class="next-why">${why}</div>
  </div>`;
}

function focusMeasRow(i) {
  const input = document.querySelector(`#measRows [data-i="${i}"][data-f="value"]`);
  if (!input) return;
  input.scrollIntoView({ block: 'center', behavior: 'smooth' });
  input.focus({ preventScroll: true });
  input.select();
}

function addMeas(a, b) {
  state.meas.push(newMeas(a, b));
  inheritCorr(state.meas.length - 1);
  renderMeas();
  renderResults();
  focusMeasRow(state.meas.length - 1);
}

function newMeas(a, b) {
  return { a, b, value: null, corr: null, end: 'a' };
}

function renderResiduals(f) {
  const tb = $('#residTable tbody');
  if (!f || !f.residuals.length) {
    tb.innerHTML = '<tr><td colspan="4" style="color:var(--color-text-muted);font-family:var(--font-body)">Enter measurements to see the comparison.</td></tr>';
    return;
  }
  tb.innerHTML = f.residuals.map(r => {
    const cls = Math.abs(r.delta) <= state.tol ? 'ok' : Math.abs(r.delta) <= 3 * state.tol ? 'warn' : 'err';
    return `<tr>
      <td>${esc(r.a)}–${esc(r.b)}</td>
      <td>${fmt(r.dDesign)}</td>
      <td title="${r.corr ? `reading ${fmt(r.reading)} − correction ${fmt(r.corr)}` : ''}">${fmt(r.value)}${r.corr ? '*' : ''}</td>
      <td><span class="badge ${cls}">${sfmt(r.delta)}</span></td>
    </tr>`;
  }).join('');
}

/** Names of the four field sides, by the piles standing on them (as seen on the plan). */
function sideNames(design) {
  if (!design.length) return { 'x+': '', 'x-': '', 'y+': '', 'y-': '' };
  const xs = design.map(p => p.x), ys = design.map(p => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const col = x => design.filter(p => Math.abs(p.x - x) < 0.6).sort((a, b) => a.y - b.y).map(p => p.label);
  const row = y => design.filter(p => Math.abs(p.y - y) < 0.6).sort((a, b) => a.x - b.x).map(p => p.label);
  const name = arr => arr.length > 2 ? `${arr[0]}–${arr[arr.length - 1]}` : arr.join('/');
  return { 'x+': name(col(xMax)), 'x-': name(col(xMin)), 'y+': name(row(yMax)), 'y-': name(row(yMin)) };
}

function pinButton(label) {
  const on = state.pinned.has(label);
  return `<button class="pin-btn ${on ? 'on' : ''}" data-pin="${esc(label)}" title="Pinned piles are treated as exact references">${on ? 'pinned' : 'pin'}</button>`;
}

function renderCorrections(res) {
  const tb = $('#corrTable tbody');
  if (!res || !res.align) {
    tb.innerHTML = state.piles.map(p => `<tr>
      <td>${esc(p.label)}</td><td>—</td><td>—</td><td>—</td><td>${pinButton(p.label)}</td>
    </tr>`).join('') || '<tr><td colspan="5" style="color:var(--color-text-muted);font-family:var(--font-body)">Add piles.</td></tr>';
    return;
  }
  const rows = [...res.align.e].sort((a, b) => b.mag - a.mag);
  tb.innerHTML = rows.map(c => {
    const rowCls = !needsMove(c.mag) ? 'ok' : c.mag <= 3 * state.tol ? 'warn' : 'err';
    return `<tr>
      <td>${esc(c.label)}</td>
      <td class="${rowCls}">${sfmt(c.dx)}</td>
      <td class="${rowCls}">${sfmt(c.dy)}</td>
      <td class="${rowCls}"><b>${fmt(c.mag)}</b></td>
      <td>${pinButton(c.label)}</td>
    </tr>`;
  }).join('');
}

/* ============================== visual move plan ============================== */
const NICE_STEPS = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];

/** Places cards in the same row/column arrangement as the piles on the plan; null if the field isn't grid-like. */
function gridLayout(piles) {
  const key = v => Math.round(v);
  const xs = [...new Set(piles.map(p => key(p.x)))].sort((a, b) => a - b);
  const ys = [...new Set(piles.map(p => key(p.y)))].sort((a, b) => a - b);
  if (!piles.length || xs.length > 14 || ys.length > 6 || xs.length * ys.length > 2 * piles.length) return null;
  const cells = new Set();
  const at = piles.map(p => {
    const col = xs.indexOf(key(p.x)) + 1, row = ys.indexOf(key(p.y)) + 1;
    cells.add(row + ':' + col);
    return { col, row };
  });
  if (cells.size !== piles.length) return null; // two piles in one cell
  return { nx: xs.length, at };
}

/**
 * Zoomed top view of one pile: the design position sits at the centre with its tolerance
 * circle, the pile's actual position is drawn where it really is relative to it, and the arrow
 * (with its X and Y legs) shows the move. Same orientation as the field plan.
 */
function moveDiagram(c, tol, moving) {
  const H = 50;                                   // half-size of the view box
  const span = Math.max(c.mag, tol * 1.15, 1);    // mm visible from the centre to the margin
  const k = 36 / span;                            // view units per mm
  const px = -c.dx * k, py = -c.dy * k;           // pile now (design position is at 0,0)
  const step = NICE_STEPS.find(s => (H / k) / s <= 4) || NICE_STEPS[NICE_STEPS.length - 1];

  let s = `<svg class="mv-svg" viewBox="${-H} ${-H} ${2 * H} ${2 * H}" role="img" aria-label="${esc(c.label)}: move diagram">`;
  s += `<rect x="${-H}" y="${-H}" width="${2 * H}" height="${2 * H}" fill="#fff"/>`;
  const nLines = Math.floor((H / k) / step);
  for (let i = -nLines; i <= nLines; i++) {
    const g = i * step * k;
    const w = i === 0 ? 0.6 : 0.35;
    s += `<path d="M${g} ${-H}V${H}M${-H} ${g}H${H}" stroke="#d8d5cd" stroke-width="${w}"/>`;
  }
  s += `<circle r="${tol * k}" fill="rgba(47,125,50,0.10)" stroke="#2f7d32" stroke-width="0.8" stroke-dasharray="2.4 1.6"/>`;

  if (moving) {
    const minLeg = Math.max(0.5, 0.2 * c.mag);
    const showLegs = Math.abs(c.dx) >= minLeg && Math.abs(c.dy) >= minLeg;
    if (showLegs) {
      // X leg (along the field) then Y leg (across), labelled away from the diagonal
      s += `<path d="M${px} ${py}H0V0" fill="none" stroke="#6b6f76" stroke-width="0.7" stroke-dasharray="1.6 1.2"/>`;
      const lyX = py < 0 ? py - 2.6 : py + 7.2;
      s += `<text x="${px / 2}" y="${lyX}" class="mv-leg" text-anchor="middle">${fmt(Math.abs(c.dx))}</text>`;
      const lxY = px < 0 ? 8 : -8; // past the cross arms
      s += `<text x="${lxY}" y="${py / 2 + 2.4}" class="mv-leg" text-anchor="${px < 0 ? 'start' : 'end'}">${fmt(Math.abs(c.dy))}</text>`;
    }
    const len = Math.hypot(px, py);
    const ux = -px / len, uy = -py / len;
    const hl = 6.5;
    const ex = -ux * 1.2, ey = -uy * 1.2; // stop the tip just short of the cross centre
    s += `<line x1="${px}" y1="${py}" x2="${ex - ux * hl * 0.6}" y2="${ey - uy * hl * 0.6}" stroke="#c2410c" stroke-width="2.2" stroke-linecap="round"/>`;
    const ang = Math.atan2(uy, ux);
    s += `<path d="M${ex} ${ey}L${ex - hl * Math.cos(ang - 0.45)} ${ey - hl * Math.sin(ang - 0.45)}L${ex - hl * Math.cos(ang + 0.45)} ${ey - hl * Math.sin(ang + 0.45)}Z" fill="#c2410c"/>`;
  }
  s += `<path d="M-6 0H6M0 -6V6" stroke="#22252a" stroke-width="1.4"/>`;
  s += `<circle cx="${px}" cy="${py}" r="3.6" fill="#c2410c" stroke="#fff" stroke-width="0.9"><title>${esc(c.label)} now</title></circle>`;
  s += `<text x="${-H + 2.5}" y="${H - 2.5}" class="mv-scale">grid ${fmt(step)} mm</text>`;
  s += `</svg>`;
  return s;
}

function moveDirections(c, sides) {
  const out = [];
  if (Math.abs(c.dx) >= 0.5)
    out.push(`<div><span class="mv-arr">${c.dx > 0 ? '→' : '←'}</span><b>${fmt(Math.abs(c.dx))}</b> mm <span class="mv-to">toward ${esc(sides[c.dx > 0 ? 'x+' : 'x-'])}</span></div>`);
  if (Math.abs(c.dy) >= 0.5)
    out.push(`<div><span class="mv-arr">${c.dy > 0 ? '↓' : '↑'}</span><b>${fmt(Math.abs(c.dy))}</b> mm <span class="mv-to">toward ${esc(sides[c.dy > 0 ? 'y+' : 'y-'])}</span></div>`);
  return out.join('');
}

/** Tiny map of the whole field with this pile highlighted — orientation aid on each card. */
function locator(piles, label, cls) {
  const xs = piles.map(p => p.x), ys = piles.map(p => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const w = Math.max(Math.max(...xs) - x0, 1), h = Math.max(Math.max(...ys) - y0, 1);
  const W = 64, Hh = Math.max(10, Math.min(28, W * h / w));
  const pt = p => [4 + (p.x - x0) / w * (W - 8), 4 + (p.y - y0) / h * (Hh - 8)];
  let s = `<svg class="mv-loc" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" aria-hidden="true">`;
  s += `<rect x="0.5" y="0.5" width="${W - 1}" height="${Hh - 1}" rx="2" fill="#eceee9" stroke="#c9c6bf"/>`;
  for (const p of piles) {
    const [x, y] = pt(p);
    s += p.label === label
      ? `<circle cx="${x}" cy="${y}" r="3.4" class="${cls}"/>`
      : `<circle cx="${x}" cy="${y}" r="1.6" fill="#a3a6ac"/>`;
  }
  return s + `</svg>`;
}

function renderMoves(res) {
  const host = $('#moveGrid');
  const piles = state.piles;
  const ok = res && res.status === 'ok';
  $('#moveLegend').hidden = !ok;
  if (!piles.length) { host.innerHTML = ''; return; }

  // field-shaped arrangement only if every column fits; otherwise list the cards in move order
  const grid = gridLayout(piles);
  const layout = grid && grid.nx * 150 + (grid.nx - 1) * 12 <= host.clientWidth ? grid : null;
  const byLabel = ok ? new Map(res.align.e.map(c => [c.label, c])) : new Map();
  const sides = sideNames(piles);

  const tiles = piles.map((p, i) => {
    const c = byLabel.get(p.label);
    const c0 = byLabel.get(p.label);
    const order = c0 && needsMove(c0.mag) ? res.steps.get(p.label) : 100 + i; // narrow screens list cards in move order
    const place = layout
      ? `style="grid-column:${layout.at[i].col};grid-row:${layout.at[i].row};order:${order}"`
      : `style="order:${order}"`;
    if (!c) {
      return `<div class="mv-tile idle" data-label="${esc(p.label)}" ${place}>
        <div class="mv-head"><span class="mv-label">${esc(p.label)}</span>${locator(piles, p.label, 'idle')}</div>
        <div class="mv-none">no plan yet</div>
        <div class="mv-foot">${pinButton(p.label)}</div>
      </div>`;
    }
    const moving = needsMove(c.mag);
    const stepNo = res.steps.get(c.label);
    const sev = !moving ? 'ok' : c.mag <= 3 * state.tol ? 'warn' : 'err';
    const head = moving
      ? `<span class="mv-step" title="Move order">${stepNo}</span><span class="mv-label">${esc(p.label)}</span>${locator(piles, p.label, 'mv')}<span class="mv-mag ${sev}">${fmt(c.mag)} mm</span>`
      : `<span class="mv-label">${esc(p.label)}</span>${locator(piles, p.label, 'fine')}<span class="mv-mag ok">✓ ${fmt(c.mag)} mm</span>`;
    return `<div class="mv-tile ${moving ? 'moving' : 'fine'}" data-label="${esc(p.label)}" ${place}>
      <div class="mv-head">${head}</div>
      ${moveDiagram(c, state.tol, moving)}
      <div class="mv-dirs">${moving ? moveDirections(c, sides) : '<div class="ok">within tolerance — leave it</div>'}</div>
      ${p.shared ? '<div class="mv-shared" title="One pile carries the corner castings of both neighbouring containers">shared joint pile</div>' : ''}
      <div class="mv-foot">${pinButton(p.label)}</div>
    </div>`;
  });
  const gridStyle = layout ? `style="grid-template-columns:repeat(${layout.nx}, minmax(150px, 1fr))"` : '';
  host.innerHTML = `<div class="mv-grid ${layout ? 'spatial' : 'flow'}" ${gridStyle}>${tiles.join('')}</div>`;
}

/* ============================== summary & notes ============================== */
function renderAdvice(res) {
  const sum = $('#summary');
  const box = $('#advice');
  box.innerHTML = '';
  if (!res || res.status === 'empty') {
    sum.innerHTML = `<div class="advice-box">Enter the design coordinates of the piles and the measurements between them — the move plan will appear here.</div>`;
    return;
  }
  const tol = state.tol;
  const f = res.fit;

  if (res.status === 'under') {
    sum.innerHTML = `<div class="advice-box warn"><strong>The measurements do not fix the field:</strong> system rank is ${res.rank}, ${res.need} required. Some piles can move without changing any measurement (e.g. a pile tied by a single measurement swings around its neighbour). Add measurements to the "loose" piles — usually diagonals.</div>`;
    return;
  }

  if (res.status === 'contradictory') {
    const worstRes = [...f.residuals].sort((a, b) => Math.abs(b.fitErr) - Math.abs(a.fitErr))[0];
    sum.innerHTML = `<div class="advice-box err"><strong>The measurements contradict each other:</strong> model misclosure is <span class="num">${fmt(f.rms, 2)} mm</span> — with consistent measurements it is close to zero. One measurement is probably wrong — check <span class="num">${esc(worstRes.a)}–${esc(worstRes.b)}</span> first (off by <span class="num">${sfmt(worstRes.fitErr)}</span> mm). No move plan is shown until the misclosure is resolved.</div>`;
    return;
  }

  if (res.status === 'pinconflict') {
    const off = res.align.e.filter(c => state.pinned.has(c.label));
    sum.innerHTML = `<div class="advice-box warn"><strong>Pinned piles disagree with the measurements:</strong> for every placement of the design field, pinned pile ${esc(off.map(o => o.label + ' (offset ' + fmt(o.mag) + ' mm)').join(', '))} falls outside tolerance. Check the measurements involving it or unpin it. No move plan is shown.</div>`;
    return;
  }

  // status === 'ok'
  const e = res.align.e;
  const maxC = e.reduce((m, c) => Math.max(m, c.mag), 0);
  const moves = res.moves;
  const nBad = moves.length;
  const shiftMag = Math.hypot(res.align.t.x, res.align.t.y);

  if (nBad === 0) {
    sum.innerHTML = `<div class="advice-box ok"><strong>Everything is within tolerance.</strong> Largest pile offset is <span class="num">${fmt(maxC)} mm</span> at a tolerance of <span class="num">${fmt(tol)} mm</span>. No moves needed.</div>`;
  } else {
    sum.innerHTML = `<div class="advice-box"><strong>${nBad} ${plural(nBad, 'move', 'moves')}</strong> out of ${state.piles.length} piles. Move each orange pile once, onto the cross, in the numbered order (largest first). Measurement RMS: <span class="num">${fmt(f.rms, 2)} mm</span>.</div>`;
    const first = moves[0];
    const affected = f.used.filter(m => m.a === first.label || m.b === first.label).map(m => `${m.a}–${m.b}`);
    if (affected.length) box.insertAdjacentHTML('beforeend',
      `<div class="advice-box"><strong>After moving ${esc(first.label)}</strong>, re-measure <span class="num">${esc(affected.join(', '))}</span> and update them on the page — the plan will be recalculated.</div>`);
    // minimality
    if (moves.length === res.lb) {
      box.insertAdjacentHTML('beforeend',
        `<div class="advice-box ok">Minimality confirmed: the conflicting measurement pairs require at least ${res.lb} ${plural(res.lb, 'move', 'moves')} — no shorter plan exists.</div>`);
    } else if (res.proven) {
      box.insertAdjacentHTML('beforeend',
        `<div class="advice-box ok">Minimality confirmed: an exhaustive angle search with a coverage upper bound found no shorter plan (the pairwise lower bound of ${res.lb} is just weaker).</div>`);
    } else {
      box.insertAdjacentHTML('beforeend',
        `<div class="advice-box">The lower bound from conflicting pairs is ${res.lb} ${plural(res.lb, 'move', 'moves')}, ${moves.length} found, and the optimality check did not finish: the plan may not be the shortest. Re-check the measurements and recalculate.</div>`);
    }
  }

  // service notes
  if (shiftMag > 3 * tol) {
    box.insertAdjacentHTML('beforeend',
      `<div class="advice-box">The calculation is done in the field's own frame: an overall shift and rotation of the whole field is invisible to pile-to-pile measurements and needs no correction — the container will sit on the piles wherever the field is. If the position relative to the string lines matters, pin two piles that are set exactly on the axes.</div>`);
  }
  const pinExtra = res.free && res.align
    ? nBad - res.free.e.filter(c => needsMove(c.mag)).length : 0;
  if (state.pinned.size && pinExtra > 0) {
    box.insertAdjacentHTML('beforeend',
      `<div class="advice-box warn">Pinned piles added ${pinExtra} ${plural(pinExtra, 'move', 'moves')} to the plan — make sure the pinned piles really are exact, otherwise better unpin them.</div>`);
  }
}

/* ============================== field plan (SVG) ============================== */
function renderPlan(res) {
  const host = $('#plan');
  if (!state.piles.length) { host.innerHTML = ''; return; }

  const outlines = state.outline;
  const hasOutline = outlines.length > 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  if (hasOutline) {
    for (const o of outlines) {
      minX = Math.min(minX, o.x0); maxX = Math.max(maxX, o.x0 + o.L);
      minY = Math.min(minY, 0); maxY = Math.max(maxY, o.W);
    }
  } else {
    for (const p of state.piles) {
      minX = Math.min(minX, p.x - 400); maxX = Math.max(maxX, p.x + 400);
      minY = Math.min(minY, p.y - 400); maxY = Math.max(maxY, p.y + 400);
    }
  }
  // z: label/marker scale so text stays ≥ ~11 px on screen whatever the drawing width
  const z = Math.max(1, ((maxX - minX + 360) / Math.max(host.clientWidth || 700, 200)) * 11 / 105);
  const pad = Math.max(180, 250 * z); // room for the (scaled) labels and badges
  const vb = { x: minX - pad, y: minY - pad, w: (maxX - minX) + 2 * pad, h: (maxY - minY) + 2 * pad };

  const idx = new Map(state.piles.map((p, i) => [p.label, i]));
  const pos = res && res.fit ? res.fit.pos : state.piles.map(p => [p.x, p.y]);
  const E = state.exagg;

  // map design coordinates into the aligned field frame
  let T = null;
  if (res && res.status === 'ok') T = res.align;
  const mapD = (x, y) => {
    if (!T) return [x, y];
    const dx = x - T.dcx, dy = y - T.dcy;
    return [T.dcx + T.R[0] * dx - T.R[1] * dy + T.t.x, T.dcy + T.R[1] * dx + T.R[0] * dy + T.t.y];
  };
  // the same rigid map as an SVG transform: shapes drawn in design coordinates
  // (outlines, castings, pile heads) are rotated exactly, not approximated by axis-aligned boxes
  const designFrame = (() => {
    if (!T) return '';
    const [a, b] = T.R;
    const e = T.dcx - a * T.dcx + b * T.dcy + T.t.x;
    const f = T.dcy - b * T.dcx - a * T.dcy + T.t.y;
    return `transform="matrix(${a} ${b} ${-b} ${a} ${e} ${f})"`;
  })();

  let s = `<svg viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" role="img" aria-label="Pile field plan">`;
  s += `<defs><pattern id="grid" width="500" height="500" patternUnits="userSpaceOnUse">
    <path d="M500 0H0V500" fill="none" stroke="#d8d5cd" stroke-width="4"/></pattern></defs>`;
  s += `<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="url(#grid)"/>`;

  // container outlines (design coordinates, placed by the alignment transform)
  s += `<g ${designFrame}>`;
  for (const o of outlines) {
    s += `<rect x="${o.x0}" y="0" width="${o.L}" height="${o.W}" fill="#eceee9" stroke="#5b6470" stroke-width="8"/>`;
    // corner castings
    const cs = [[o.cast, 89.5], [o.L - o.cast, 89.5], [o.cast, o.W - 89.5], [o.L - o.cast, o.W - 89.5]];
    for (const [cx, cy] of cs) {
      s += `<rect x="${o.x0 + cx - 89}" y="${cy - 81}" width="178" height="162" fill="rgba(91,100,112,0.10)" stroke="#5b6470" stroke-width="3" stroke-dasharray="14 10" opacity="0.8"><title>Container corner casting (178×162)</title></rect>`;
    }
    // forklift pockets (20' only)
    if (o.pockets) {
      for (const px of [2005, 4053]) {
        for (const yy of [0, o.W - 160]) {
          s += `<rect x="${o.x0 + px - 177.5}" y="${yy}" width="355" height="160" fill="#5b6470" opacity="0.18"><title>Forklift pocket (schematic)</title></rect>`;
        }
      }
    }
  }
  s += `</g>`;

  // measurement lines
  if (state.showEdges && res && res.fit) {
    s += `<g class="meas-lines">`;
    for (const r of res.fit.residuals) {
      const i = idx.get(r.a), j = idx.get(r.b);
      const cls = Math.abs(r.delta) <= state.tol ? '#2f7d32' : Math.abs(r.delta) <= 3 * state.tol ? '#9a6700' : '#b3261e';
      s += `<line x1="${pos[i][0]}" y1="${pos[i][1]}" x2="${pos[j][0]}" y2="${pos[j][1]}" stroke="${cls}" stroke-width="7" opacity="0.5"><title>${esc(r.a)}–${esc(r.b)}: measured ${fmt(r.value)}, design ${fmt(r.dDesign)}</title></line>`;
    }
    s += `</g>`;
  }

  // per pile: design cap + axes, actual position, arrow to design, move-order badge
  const allowArrows = res && res.status === 'ok';
  for (let i = 0; i < state.piles.length; i++) {
    const p = state.piles[i];
    const fx = pos[i][0], fy = pos[i][1];
    const [dx, dy] = mapD(p.x, p.y);
    s += `<g class="pile" data-label="${esc(p.label)}">`;
    const hd = state.head;
    const capTitle = p.shared
      ? `Shared pile head ${fmt(hd)}×${fmt(hd)} — carries the corner castings of both containers, ${esc(p.label)}`
      : `Pile head ${fmt(hd)}×${fmt(hd)} — design, ${esc(p.label)}`;
    s += `<rect ${designFrame} x="${p.x - hd / 2}" y="${p.y - hd / 2}" width="${hd}" height="${hd}" fill="${p.shared ? 'rgba(1,105,111,0.10)' : 'none'}" stroke="${p.shared ? '#01696f' : '#9aa0a8'}" stroke-width="5" opacity="0.8"><title>${capTitle}</title></rect>`;
    s += `<circle cx="${fx}" cy="${fy}" r="${26 * z}" fill="#c2410c"><title>${esc(p.label)}: actual position</title></circle>`;
    let badge = '';
    if (allowArrows) {
      const c = res.align.e.find(q => q.label === p.label);
      if (c && needsMove(c.mag)) { // same predicate as the move plan
        const tx = fx + (dx - fx) * E, ty = fy + (dy - fy) * E;
        const ax = Math.atan2(ty - fy, tx - fx);
        const hl = 90 * z;
        s += `<line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" stroke="#c2410c" stroke-width="${14 * z}"/>`;
        s += `<path d="M${tx} ${ty} L${tx - hl * Math.cos(ax - 0.42)} ${ty - hl * Math.sin(ax - 0.42)} L${tx - hl * Math.cos(ax + 0.42)} ${ty - hl * Math.sin(ax + 0.42)} Z" fill="#c2410c"/>`;
        const txt = fmt(c.mag), tw = 0.62 * 95 * z * txt.length;
        let right = Math.cos(ax) >= 0;
        if (right && tx + 60 * z + tw > vb.x + vb.w) right = false;
        else if (!right && tx - 60 * z - tw < vb.x) right = true;
        const ly = ty - 40 * z < vb.y + 95 * z ? ty + 130 * z : ty - 40 * z;
        s += `<text x="${tx + (right ? 60 : -60) * z}" y="${ly}" font-size="${95 * z}" fill="#c2410c" font-weight="600" text-anchor="${right ? 'start' : 'end'}">${txt}</text>`;
        const n = res.steps.get(p.label);
        badge = `<circle cx="${dx + 175 * z}" cy="${dy - 155 * z}" r="${68 * z}" fill="#c2410c"/><text x="${dx + 175 * z}" y="${dy - 122 * z}" font-size="${95 * z}" fill="#fff" font-weight="700" text-anchor="middle">${n}</text>`;
      } else if (c) {
        badge = `<g transform="translate(${dx + 175 * z} ${dy - 155 * z}) scale(${z})"><circle r="60" fill="#2f7d32"/><path d="M-30 0 l22 24 l42 -48" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></g>`;
      }
    }
    s += `<text x="${dx}" y="${dy - 120 * z}" font-size="${105 * z}" fill="#22252a" font-weight="600" text-anchor="middle">${esc(p.label)}</text>`;
    s += badge;
    s += `<path d="M${dx - 45 * z} ${dy} H${dx + 45 * z} M${dx} ${dy - 45 * z} V${dy + 45 * z}" stroke="#22252a" stroke-width="${8 * z}"/>`;
    s += `</g>`;
  }

  s += `</svg>`;
  host.innerHTML = s;
}

function renderResults() {
  const res = computeFit();
  renderResiduals(res.fit);
  renderCorrections(res);
  renderAdvice(res);
  renderMoves(res);
  renderPlan(res);
  renderNext(res);
  saveState();
}

/* ============================== events ============================== */
$('#preset').addEventListener('change', e => {
  applyPreset(e.target.value);
});

$('#comboBar').addEventListener('click', e => {
  const add = e.target.closest('[data-add]');
  const rm = e.target.closest('[data-rm]');
  if (add) { state.containers.push(add.dataset.add); rebuildCombo(); }
  else if (rm) { state.containers.splice(+rm.dataset.rm, 1); rebuildCombo(); }
  else if (e.target.closest('#comboClear')) { state.containers = []; rebuildCombo(); }
});

$('#coords tbody').addEventListener('input', e => {
  const t = e.target;
  if (!t.dataset.i) return;
  const i = +t.dataset.i, f = t.dataset.f;
  if (f === 'label') {
    // keep measurements and pins attached to the renamed pile
    const old = state.piles[i].label;
    for (const m of state.meas) { if (m.a === old) m.a = t.value; if (m.b === old) m.b = t.value; }
    if (state.pinned.delete(old)) state.pinned.add(t.value);
    state.piles[i].label = t.value;
  } else state.piles[i][f] = parseNum(t.value) ?? state.piles[i][f];
  renderMeas();
  renderResults();
});
$('#coords tbody').addEventListener('click', e => {
  const btn = e.target.closest('button.del');
  if (!btn) return;
  const i = +btn.dataset.i;
  const lbl = state.piles[i].label;
  state.piles.splice(i, 1);
  state.pinned.delete(lbl);
  state.meas = state.meas.filter(m => m.a !== lbl && m.b !== lbl);
  renderCoords();
  renderMeas();
  renderResults();
});
$('#addPile').addEventListener('click', () => {
  const n = state.piles.length + 1;
  state.piles.push({ label: 'M' + n, x: 0, y: 0 });
  renderCoords();
  renderMeas();
  renderResults();
});

$('#measRows').addEventListener('input', e => {
  const t = e.target;
  if (!t.dataset.i) return;
  const i = +t.dataset.i, f = t.dataset.f;
  const m = state.meas[i];
  if (f === 'value' || f === 'corr') {
    m[f] = parseNum(t.value);
    t.closest('.meas-row').querySelector('.meas-corr').classList.toggle('set', !!m.corr);
    updateRowBadge(i);      // keep focus in the input — don't rebuild the DOM
    renderResults();
  } else {
    m[f] = t.value;         // a pile changed: refresh the end buttons' labels
    if (f === m.end) inheritCorr(i);
    renderMeas();
    renderResults();
  }
});
$('#measRows').addEventListener('click', e => {
  const end = e.target.closest('[data-end]');
  if (end) {
    const i = +end.dataset.i;
    state.meas[i].end = end.dataset.end;
    inheritCorr(i);
    renderMeas();
    renderResults();
    return;
  }
  const btn = e.target.closest('button.del');
  if (!btn) return;
  state.meas.splice(+btn.dataset.i, 1);
  renderMeas();
  renderResults();
});
$('#addMeas').addEventListener('click', () => {
  if (state.piles.length < 2) return;
  const { a, b } = nextSuggestedPair();
  addMeas(a, b);
});
$('#measNext').addEventListener('click', e => {
  const go = e.target.closest('[data-next-go]');
  if (go) { focusMeasRow(+go.dataset.nextGo); return; }
  if (e.target.closest('[data-next-add]') && lastAdvice) addMeas(lastAdvice.a, lastAdvice.b);
});

/** Test helpers work on the recommended set when no measurements were added yet. */
function ensureMeasRows() {
  if (!state.meas.length) state.meas = defaultMeas(state.piles).map(m => newMeas(m.a, m.b));
}

// pin toggles live both on the move cards and in the numeric table
$('#movesCard').addEventListener('click', e => {
  const btn = e.target.closest('[data-pin]');
  if (!btn) return;
  const lbl = btn.dataset.pin;
  if (state.pinned.has(lbl)) state.pinned.delete(lbl); else state.pinned.add(lbl);
  renderResults();
});

// hovering a move card highlights that pile on the field plan
function highlightPile(label) {
  const svg = $('#plan svg');
  if (!svg) return;
  svg.classList.toggle('focus', label != null);
  for (const g of svg.querySelectorAll('g.pile')) g.classList.toggle('on', g.dataset.label === label);
}
$('#moveGrid').addEventListener('mouseover', e => {
  const tile = e.target.closest('.mv-tile');
  highlightPile(tile ? tile.dataset.label : null);
});
$('#moveGrid').addEventListener('mouseleave', () => highlightPile(null));

// pile head size and inset: validate, then regenerate the design piles (measurements are kept)
function readRange(el, [lo, hi]) {
  const v = parseNum(el.value);
  const ok = v != null && v >= lo && v <= hi;
  el.classList.toggle('invalid', !ok);
  return ok ? v : null;
}
for (const id of ['#head', '#inset']) {
  $(id).addEventListener('input', () => {
    const head = readRange($('#head'), HEAD_RANGE);
    const inset = readRange($('#inset'), INSET_RANGE);
    if (head == null || inset == null) return;
    state.head = head;
    state.inset = inset;
    rebuildField(true);
  });
}

$('#tol').addEventListener('input', e => {
  const v = parseNum(e.target.value);
  if (v != null && v >= 0.5) state.tol = v;
  renderResults();
});
$('#exagg').addEventListener('input', e => {
  state.exagg = parseNum(e.target.value) ?? 10;
  $('#exaggVal').textContent = state.exagg;
  renderResults();
});
$('#edges').addEventListener('change', e => {
  state.showEdges = e.target.checked;
  renderResults();
});

$('#fillDesign').addEventListener('click', () => {
  ensureMeasRows();
  for (const m of state.meas) {
    const a = state.piles.find(p => p.label === m.a);
    const b = state.piles.find(p => p.label === m.b);
    m.value = a && b ? dist(a, b) + (m.corr ?? 0) : null; // the tape would read the correction on top
  }
  renderMeas();
  renderResults();
});

$('#demo').addEventListener('click', () => {
  ensureMeasRows();
  const truth = state.piles.map(p => {
    const ang = Math.random() * Math.PI * 2;
    const mag = 2 + Math.random() * 22;
    return { x: p.x + mag * Math.cos(ang), y: p.y + mag * Math.sin(ang) };
  });
  const by = new Map(state.piles.map((p, i) => [p.label, truth[i]]));
  for (const m of state.meas) {
    const a = by.get(m.a), b = by.get(m.b);
    m.value = a && b ? dist(a, b) + (m.corr ?? 0) : null;
  }
  renderMeas();
  renderResults();
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderResults, 150);
});

$('#newSession').addEventListener('click', () => {
  if (!confirm('Start a new session? All piles, measurements and settings saved on this device will be cleared.')) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* nothing saved */ }
  Object.assign(state, defaultState());
  syncControls();
  applyPreset(state.preset);
});

/* ============================== init ============================== */
renderPresetSelect();
if (loadState()) {
  syncControls();
  renderComboBar();
  renderCoords();
  renderMeas();
  renderResults();
} else {
  syncControls();
  applyPreset(state.preset);
}
