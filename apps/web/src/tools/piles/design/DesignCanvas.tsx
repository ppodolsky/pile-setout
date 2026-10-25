import { useMemo, useRef, useState } from 'react';
import { bounds, expandBox, type Vec2 } from '@buildkit/geometry';
import type { Pile } from '@buildkit/pile-field';
import { Grid, Label, Seg, toScreen, toWorld, useView, Viewport } from '@/drawing';
import { fmt } from '@/lib/format';
import { useEditor } from '../model/editor';
import { useOutlines, useResolved } from '../model/derived';
import { useProject } from '../model/store';
import { Containers, Dependencies, PileHead, PileHit, PileMark } from '../drawing/layers';

const SNAP_GRID = 5; // mm
const SNAP_PX = 8; // align with another pile's axis within this many pixels

/** Snaps to the 5 mm grid and to other piles' X / Y within a few pixels; returns guides to draw. */
function snap(p: Vec2, piles: readonly Pile[], s: number, except?: string) {
  let x = Math.round(p.x / SNAP_GRID) * SNAP_GRID;
  let y = Math.round(p.y / SNAP_GRID) * SNAP_GRID;
  let gx: Pile | undefined;
  let gy: Pile | undefined;
  for (const q of piles) {
    if (q.id === except) continue;
    if (!gx && Math.abs(q.x - p.x) * s < SNAP_PX) {
      x = q.x;
      gx = q;
    }
    if (!gy && Math.abs(q.y - p.y) * s < SNAP_PX) {
      y = q.y;
      gy = q;
    }
  }
  return { at: { x, y }, gx, gy };
}

export function DesignCanvas() {
  const { piles } = useResolved();
  const outlines = useOutlines();
  const head = useProject((s) => s.design.template.head);
  const { addPile, updatePile } = useProject.getState();
  const { tool, selected, picks, select, pick, setTool } = useEditor();
  const [cursor, setCursor] = useState<Vec2 | null>(null);

  const content = useMemo(() => {
    const pts = [
      ...piles,
      ...outlines.flatMap((o) => [
        { x: o.x0, y: 0 },
        { x: o.x0 + o.length, y: o.width },
      ]),
    ];
    return expandBox(pts.length ? bounds(pts) : { minX: 0, minY: 0, maxX: 6000, maxY: 2400 }, 250);
  }, [piles, outlines]);

  const onPilePick = (p: Pile) => {
    if (tool === 'select' || tool === 'fixed') return select(p.id);
    if (tool === 'polar') {
      const id = addPile({ kind: 'polar', from: p.id, distance: 1000, angle: 0, ref: null });
      select(id);
      return setTool('select');
    }
    // between: two picks
    if (!picks.length) return pick(p.id);
    if (picks[0] === p.id) return;
    const id = addPile({ kind: 'between', from: picks[0]!, to: p.id, by: 'ratio', t: 0.5 });
    select(id);
    setTool('select');
  };

  return (
    <Viewport
      label="Pile design"
      content={content}
      className="h-full min-h-[320px]"
      cursor={tool === 'fixed' ? 'crosshair' : tool === 'select' ? 'grab' : 'pointer'}
      onPointerWorld={setCursor}
      onBackgroundClick={(p, v) => {
        if (tool !== 'fixed') return select(null);
        // placed through the same snapping the preview shows
        const { at } = snap(p, piles, v.s);
        select(addPile({ kind: 'fixed', x: at.x, y: at.y }));
      }}
    >
      <Grid />
      <Containers outlines={outlines} />
      <Dependencies piles={piles} emphasis={selected} />
      {piles.map((p) => (
        <PileHead
          key={p.id}
          pile={p}
          head={head}
          tone={p.id === selected || picks.includes(p.id) ? 'selected' : p.def.kind !== 'fixed' ? 'param' : p.shared ? 'shared' : 'fixed'}
        />
      ))}
      <SelectedDimensions piles={piles} selected={selected} />
      {piles.map((p) => (
        <PileMark key={p.id} pile={p} color={p.def.kind === 'fixed' ? 'var(--draw-ink)' : 'var(--draw-param)'} />
      ))}
      {piles.map((p) =>
        tool === 'select' && p.def.kind === 'fixed' && p.id === selected ? (
          <DragHandle key={p.id} pile={p} piles={piles} onMove={(at) => updatePile(p.id, { def: { kind: 'fixed', x: at.x, y: at.y } })} />
        ) : (
          <PileHit
            key={p.id}
            pile={p}
            onPointerDown={(e) => {
              e.stopPropagation();
              onPilePick(p);
            }}
          />
        ),
      )}
      {tool === 'fixed' && cursor && <PlacementGhost at={cursor} piles={piles} head={head} />}
    </Viewport>
  );
}

function PlacementGhost({ at, piles, head }: { at: Vec2; piles: readonly Pile[]; head: number }) {
  const v = useView();
  const { at: p, gx, gy } = snap(at, piles, v.s);
  const q = toScreen(v, p);
  const h = (head * v.s) / 2;
  return (
    <g pointerEvents="none">
      {gx && <Seg a={gx} b={{ x: gx.x, y: p.y }} stroke="var(--draw-select)" strokeDasharray="3 3" />}
      {gy && <Seg a={gy} b={{ x: p.x, y: gy.y }} stroke="var(--draw-select)" strokeDasharray="3 3" />}
      <rect x={q.x - h} y={q.y - h} width={2 * h} height={2 * h} fill="none" stroke="var(--draw-select)" strokeDasharray="3 2" />
      <path d={`M${q.x - 6} ${q.y}H${q.x + 6}M${q.x} ${q.y - 6}V${q.y + 6}`} stroke="var(--draw-select)" strokeWidth={1.4} />
      <Label at={p} dx={10} dy={18} size={11} fill="var(--draw-select)">
        {fmt(p.x, 0)}, {fmt(p.y, 0)}
      </Label>
    </g>
  );
}

/** Drag a fixed pile; snaps like placement. */
function DragHandle({ pile, piles, onMove }: { pile: Pile; piles: readonly Pile[]; onMove: (p: Vec2) => void }) {
  const v = useView();
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [guides, setGuides] = useState<{ gx?: Pile; gy?: Pile }>({});
  const s = toScreen(v, pile);
  const world = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
    return toWorld(v, e.clientX - r.left, e.clientY - r.top);
  };
  return (
    <g>
      {guides.gx && <Seg a={guides.gx} b={{ x: guides.gx.x, y: pile.y }} stroke="var(--draw-select)" strokeDasharray="3 3" />}
      {guides.gy && <Seg a={guides.gy} b={{ x: pile.x, y: guides.gy.y }} stroke="var(--draw-select)" strokeDasharray="3 3" />}
      <circle
        cx={s.x}
        cy={s.y}
        r={16}
        fill="transparent"
        style={{ cursor: 'move' }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          const w = world(e);
          drag.current = { dx: pile.x - w.x, dy: pile.y - w.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const w = world(e);
          const { at, gx, gy } = snap({ x: w.x + drag.current.dx, y: w.y + drag.current.dy }, piles, v.s, pile.id);
          setGuides({ ...(gx ? { gx } : {}), ...(gy ? { gy } : {}) });
          if (at.x !== pile.x || at.y !== pile.y) onMove(at);
        }}
        onPointerUp={() => {
          drag.current = null;
          setGuides({});
        }}
      />
    </g>
  );
}

/** Dimensions of the selected parametric pile: distance along the line, or distance + angle. */
function SelectedDimensions({ piles, selected }: { piles: readonly Pile[]; selected: string | null }) {
  const p = piles.find((q) => q.id === selected);
  if (!p || p.def.kind === 'fixed') return null;
  const at = (id: string) => piles.find((q) => q.id === id);
  if (p.def.kind === 'between') {
    const a = at(p.def.from);
    if (!a) return null;
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    return (
      <Label
        at={{ x: (a.x + p.x) / 2, y: (a.y + p.y) / 2 }}
        dy={-6}
        textAnchor="middle"
        size={11}
        fill="var(--draw-param)"
        fontWeight={600}
      >
        {fmt(d, 0)}
      </Label>
    );
  }
  const a = at(p.def.from);
  if (!a) return null;
  return (
    <g>
      <Label
        at={{ x: (a.x + p.x) / 2, y: (a.y + p.y) / 2 }}
        dy={-6}
        textAnchor="middle"
        size={11}
        fill="var(--draw-param)"
        fontWeight={600}
      >
        {fmt(p.def.distance, 0)}
      </Label>
      <Label at={a} dx={34} dy={-4} size={11} fill="var(--draw-param)" fontWeight={600}>
        {fmt(p.def.angle, 1)}°
      </Label>
    </g>
  );
}
