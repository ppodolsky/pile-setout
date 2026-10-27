import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { snapPoint, type Element, type EntityRef, type Guide, type SnapContext, type SnapResult } from '@buildkit/cad';
import { bounds, expandBox, type Box, type Vec2 } from '@buildkit/geometry';
import { Grid, toScreen, toWorld, useView, Viewport } from '@/drawing';
import { fmt } from '@/lib/format';
import { ConstraintGlyphs } from './glyphs';
import { isSelected, useCadEditor } from './editor';
import type { CadT } from './meta';
import type { CadModel, CadOps } from './ops';

export interface CadCanvasProps<E extends Element> {
  readonly model: CadModel<E>;
  readonly ops: CadOps;
  readonly label: string;
  /** Drawn under the geometry (e.g. containers). */
  readonly background?: ReactNode;
  /** Domain elements drawn on their points (e.g. pile heads and labels). */
  readonly elements?: ReactNode;
  /** Extra world points to include when fitting the view (e.g. outline corners). */
  readonly extent?: readonly Vec2[];
  readonly showConstraints: boolean;
  /** Size of the placement ghost for domain tools, mm (e.g. a pile head). */
  readonly ghostSize?: number;
  /** Reference geometry to snap to without constraints (background drawings). */
  readonly reference?: SnapContext['reference'];
}

/**
 * The generic CAD canvas: points, lines, constraint glyphs and domain elements; selection (click,
 * Shift/multi, box), dragging through the solver with snapping, and drawing tools (point, line,
 * domain placement) with magnetic snapping and auto-constraints.
 */
/** Reference geometry (background drawings) for snapping, shared with the canvas' handles. */
const Reference = createContext<SnapContext['reference']>(undefined);

export function CadCanvas<E extends Element>({
  model,
  ops,
  label,
  background,
  elements,
  extent,
  showConstraints,
  ghostSize,
  reference,
}: CadCanvasProps<E>) {
  const { doc, status } = model;
  const editor = useCadEditor();
  const { tool, selection, constraint, select, selectConstraint, lineStart, setLineStart } = editor;
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const boxBase = useRef<EntityRef[]>([]);

  const content: Box = useMemo(() => {
    const pts = [...doc.points, ...(extent ?? [])];
    return expandBox(pts.length ? bounds(pts) : { minX: 0, minY: 0, maxX: 6000, maxY: 2400 }, 350);
  }, [doc.points, extent]);

  const selectedPoints = selection.filter((r) => r.kind === 'point');
  const anchorId = tool === 'line' ? lineStart : selectedPoints.length === 1 ? selectedPoints[0]!.id : null;
  const anchor = anchorId ? (doc.points.find((p) => p.id === anchorId) ?? null) : null;
  const placing = tool !== 'select';

  /** Click on a point while drawing: lines connect to it; placement tools take it as the next anchor. */
  const pickPoint = (id: string) => {
    if (tool === 'line') {
      if (lineStart && lineStart !== id) ops.addLine(lineStart, id);
      setLineStart(id);
      return;
    }
    select([{ kind: 'point', id }]);
  };

  return (
    <Reference.Provider value={reference}>
      <Viewport
        label={label}
        content={content}
        padding={64}
        className="h-full min-h-[320px]"
        cursor={placing ? 'crosshair' : 'default'}
        onPointerWorld={setCursor}
        onBackgroundClick={(p, v) => {
          if (!placing) {
            select([]);
            selectConstraint(null);
            return;
          }
          const s = snapPoint(p, { points: doc.points, lines: doc.lines, scale: v.s, anchor, reference });
          if (s.point) return pickPoint(s.point);
          const id = ops.place(tool === 'line' ? 'point' : tool, s.at, s.infer);
          if (tool === 'line') {
            if (lineStart) ops.addLine(lineStart, id);
            setLineStart(id);
          } else select([{ kind: 'point', id }]);
        }}
        onBox={(b, done, additive) => {
          if (placing) return;
          if (!boxBase.current.length || !additive) boxBase.current = additive ? selection : [];
          const [x0, x1] = [Math.min(b.a.x, b.b.x), Math.max(b.a.x, b.b.x)];
          const [y0, y1] = [Math.min(b.a.y, b.b.y), Math.max(b.a.y, b.b.y)];
          const inside = new Set(doc.points.filter((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1).map((p) => p.id));
          const refs: EntityRef[] = [
            ...[...inside].map((id) => ({ kind: 'point' as const, id })),
            ...doc.lines.filter((l) => inside.has(l.a) && inside.has(l.b)).map((l) => ({ kind: 'line' as const, id: l.id })),
          ];
          const all = [...boxBase.current, ...refs.filter((r) => !isSelected(boxBase.current, r))];
          select(all);
          if (done) boxBase.current = [];
        }}
      >
        <Grid />
        {background}
        <Lines model={model} />
        {showConstraints && (
          <ConstraintGlyphs
            points={doc.points}
            constraints={doc.constraints}
            conflicts={status.conflicts}
            selected={constraint}
            onPick={selectConstraint}
          />
        )}
        {elements}
        <BarePoints model={model} />
        <SelectionMarks model={model} />
        {doc.lines.map((l) => (
          <LineHandle key={l.id} model={model} id={l.id} />
        ))}
        {doc.points.map((p) => (
          <PointHandle key={p.id} model={model} ops={ops} id={p.id} onPick={pickPoint} />
        ))}
        {placing && cursor && (
          <PlacementGhost
            model={model}
            at={cursor}
            anchor={anchor}
            size={tool === 'point' || tool === 'line' ? 0 : (ghostSize ?? 0)}
            rubberFrom={tool === 'line' ? anchor : null}
          />
        )}
      </Viewport>
    </Reference.Provider>
  );
}

function Lines<E extends Element>({ model }: { model: CadModel<E> }) {
  const v = useView();
  const at = new Map(model.doc.points.map((p) => [p.id, p]));
  const selection = useCadEditor((s) => s.selection);
  return (
    <g>
      {model.doc.lines.map((l) => {
        const a = at.get(l.a);
        const b = at.get(l.b);
        if (!a || !b) return null;
        const A = toScreen(v, a);
        const B = toScreen(v, b);
        const on = isSelected(selection, { kind: 'line', id: l.id });
        return (
          <line
            key={l.id}
            x1={A.x}
            y1={A.y}
            x2={B.x}
            y2={B.y}
            stroke={on ? 'var(--draw-select)' : l.construction ? 'var(--draw-param)' : 'var(--draw-ink)'}
            strokeWidth={on ? 2.2 : l.construction ? 1 : 1.6}
            strokeDasharray={l.construction ? '8 5' : undefined}
            opacity={l.construction && !on ? 0.75 : 1}
          />
        );
      })}
    </g>
  );
}

/** Points without an element on them: small dots (blue while they can still move). */
function BarePoints<E extends Element>({ model }: { model: CadModel<E> }) {
  const v = useView();
  const used = new Set(model.doc.elements.map((e) => e.point));
  return (
    <g>
      {model.doc.points
        .filter((p) => !used.has(p.id))
        .map((p) => {
          const s = toScreen(v, p);
          return (
            <circle
              key={p.id}
              cx={s.x}
              cy={s.y}
              r={3.5}
              fill={model.status.determined.has(p.id) ? 'var(--draw-ink)' : 'var(--draw-free)'}
            />
          );
        })}
    </g>
  );
}

/** Selection rings with pick-order numbers (constraints use the order). */
function SelectionMarks<E extends Element>({ model }: { model: CadModel<E> }) {
  const v = useView();
  const selection = useCadEditor((s) => s.selection);
  const pts = selection.filter((r) => r.kind === 'point');
  return (
    <g pointerEvents="none">
      {pts.map((r) => {
        const p = model.doc.points.find((q) => q.id === r.id);
        if (!p) return null;
        const s = toScreen(v, p);
        return (
          <g key={r.id}>
            <circle cx={s.x} cy={s.y} r={13} fill="none" stroke="var(--draw-select)" strokeWidth={2} />
            {selection.length > 1 && (
              <g>
                <circle cx={s.x - 14} cy={s.y + 14} r={7} fill="var(--draw-select)" />
                <text x={s.x - 14} y={s.y + 17.5} fontSize={9} textAnchor="middle" fill="white" fontWeight={700}>
                  {selection.findIndex((x) => x.kind === r.kind && x.id === r.id) + 1}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

function LineHandle<E extends Element>({ model, id }: { model: CadModel<E>; id: string }) {
  const v = useView();
  const { tool, select, toggle, multi } = useCadEditor();
  const l = model.doc.lines.find((x) => x.id === id)!;
  const a = model.doc.points.find((p) => p.id === l.a);
  const b = model.doc.points.find((p) => p.id === l.b);
  if (!a || !b || tool !== 'select') return null;
  const A = toScreen(v, a);
  const B = toScreen(v, b);
  return (
    <line
      data-line={id}
      x1={A.x}
      y1={A.y}
      x2={B.x}
      y2={B.y}
      stroke="transparent"
      strokeWidth={12}
      style={{ cursor: 'pointer' }}
      onPointerDown={(e) => {
        e.stopPropagation();
        const ref = { kind: 'line' as const, id };
        if (multi || e.shiftKey || e.metaKey || e.ctrlKey) toggle(ref);
        else select([ref]);
      }}
    />
  );
}

/**
 * Click to select (Shift/Ctrl/⌘ or multi-select to add), drag to move. Moving goes through the
 * solver with snapping: free geometry follows; dimensions holding the point follow the drag.
 */
function PointHandle<E extends Element>({
  model,
  ops,
  id,
  onPick,
}: {
  model: CadModel<E>;
  ops: CadOps;
  id: string;
  onPick: (id: string) => void;
}) {
  const v = useView();
  const { tool, selection, select, toggle, multi } = useCadEditor();
  const reference = useContext(Reference);
  const drag = useRef<{ dx: number; dy: number; x: number; y: number; moved: boolean; narrow: boolean } | null>(null);
  const [snap, setSnap] = useState<SnapResult | null>(null);
  const p = model.doc.points.find((q) => q.id === id)!;
  const s = toScreen(v, p);
  const local = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const label = model.labelOf(id);
  return (
    <g>
      {snap && <Guides guides={snap.guides} label={snap.label} at={snap.at} />}
      <circle
        data-point={label || id}
        cx={s.x}
        cy={s.y}
        r={16}
        fill="transparent"
        style={{ cursor: tool === 'select' ? 'move' : 'pointer' }}
        onPointerDown={(e) => {
          e.stopPropagation();
          const ref = { kind: 'point' as const, id };
          if (tool !== 'select') return onPick(id);
          if (multi || e.shiftKey || e.metaKey || e.ctrlKey) return toggle(ref);
          // a click on a pile already in a multi-selection narrows the selection to it on release
          // (unless it turns into a drag)
          const narrow = isSelected(selection, ref) && selection.length > 1;
          if (!isSelected(selection, ref)) select([ref]);
          e.currentTarget.setPointerCapture(e.pointerId);
          const q = local(e);
          const w = toWorld(v, q.x, q.y);
          drag.current = { dx: p.x - w.x, dy: p.y - w.y, x: q.x, y: q.y, moved: false, narrow };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const q = local(e);
          if (!d.moved && Math.hypot(q.x - d.x, q.y - d.y) < 3) return;
          d.moved = true;
          const w = toWorld(v, q.x, q.y);
          const sn = snapPoint(
            { x: w.x + d.dx, y: w.y + d.dy },
            { points: model.doc.points, lines: model.doc.lines, scale: v.s, exclude: new Set([id]), reference },
          );
          setSnap(sn);
          ops.movePoint(id, sn.at);
        }}
        onPointerUp={() => {
          if (drag.current?.narrow && !drag.current.moved) select([{ kind: 'point', id }]);
          drag.current = null;
          setSnap(null);
        }}
      />
    </g>
  );
}

/** A snap readout in the current language: 'midpoint' / 'on line' translated, polar distance formatted. */
function snapLabel(label: string, t: CadT): string {
  if (label === 'midpoint') return t('snap.midpoint');
  if (label === 'on line') return t('snap.onLine');
  const polar = /^(-?[\d.]+)° · ([\d,.]+)$/.exec(label); // "90° · 2,500"
  if (polar) return `${polar[1]}° · ${fmt(Number(polar[2]!.replaceAll(',', '')), 0)}`;
  return label;
}

function Guides({ guides, label: raw, at }: { guides: readonly Guide[]; label: string | null; at: Vec2 }) {
  const { t } = useTranslation('cad');
  const label = raw && snapLabel(raw, t);
  const v = useView();
  const S = (p: Vec2) => toScreen(v, p);
  const P = S(at);
  return (
    <g pointerEvents="none" stroke="var(--draw-select)" fill="none">
      {guides.map((g, i) => {
        if (g.kind === 'point') {
          const q = S(g.at);
          return <circle key={i} cx={q.x} cy={q.y} r={7} strokeWidth={1.5} />;
        }
        const a = S(g.from);
        const b = S(g.to);
        if (g.kind === 'line') return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={3} opacity={0.35} />;
        // extend axis guides across the view so the alignment reads at a glance
        if (g.kind === 'align-x') return <line key={i} x1={a.x} y1={0} x2={a.x} y2={v.height} strokeWidth={0.8} strokeDasharray="4 4" />;
        if (g.kind === 'align-y') return <line key={i} x1={0} y1={a.y} x2={v.width} y2={a.y} strokeWidth={0.8} strokeDasharray="4 4" />;
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={1} strokeDasharray="6 4" />;
      })}
      {label && (
        <g>
          <rect x={P.x + 12} y={P.y + 10} width={label.length * 6.6 + 10} height={17} rx={4} fill="var(--draw-select)" stroke="none" />
          <text x={P.x + 17} y={P.y + 22} fontSize={11} fill="white" stroke="none" fontWeight={600} className="font-mono">
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

/** Where a click would place a point: snapped position, guides, readout, rubber band for lines. */
function PlacementGhost<E extends Element>({
  model,
  at,
  anchor,
  size,
  rubberFrom,
}: {
  model: CadModel<E>;
  at: Vec2;
  anchor: { id: string; x: number; y: number } | null;
  size: number;
  rubberFrom: Vec2 | null;
}) {
  const { t } = useTranslation('cad');
  const v = useView();
  const reference = useContext(Reference);
  const s = snapPoint(at, { points: model.doc.points, lines: model.doc.lines, scale: v.s, anchor, reference });
  const q = toScreen(v, s.at);
  const h = (size * v.s) / 2;
  const coords = t('coords', { x: fmt(Math.round(s.at.x), 0), y: fmt(Math.round(s.at.y), 0) });
  return (
    <g pointerEvents="none">
      {rubberFrom &&
        (() => {
          const a = toScreen(v, rubberFrom);
          return <line x1={a.x} y1={a.y} x2={q.x} y2={q.y} stroke="var(--draw-select)" strokeWidth={1.4} />;
        })()}
      <Guides guides={s.guides} label={s.label ?? coords} at={s.at} />
      {h > 0 && <rect x={q.x - h} y={q.y - h} width={2 * h} height={2 * h} fill="none" stroke="var(--draw-select)" strokeDasharray="3 2" />}
      <path d={`M${q.x - 6} ${q.y}H${q.x + 6}M${q.x} ${q.y - 6}V${q.y + 6}`} stroke="var(--draw-select)" strokeWidth={1.4} />
    </g>
  );
}
