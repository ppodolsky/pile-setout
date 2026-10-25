import { Maximize2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Box, Vec2 } from '@buildkit/geometry';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fitView, toWorld, ViewContext, zoomAt, type View } from './view';

export interface ViewportProps {
  /** World box to fit (mm). */
  readonly content: Box;
  readonly padding?: number;
  readonly className?: string;
  readonly children: ReactNode;
  /** Click (no drag) on empty canvas, in world coordinates. */
  readonly onBackgroundClick?: (p: Vec2, view: View) => void;
  /** Pointer position over the canvas, in world coordinates (null when it leaves). */
  readonly onPointerWorld?: (p: Vec2 | null) => void;
  readonly cursor?: string;
  /** Extra controls shown in the top-right corner next to "Fit". */
  readonly controls?: ReactNode;
  readonly label: string;
}

/**
 * Pan/zoom canvas for drawings in world millimetres. Wheel or pinch zooms, dragging empty space
 * pans, "Fit" returns to the whole drawing. Until the user pans or zooms, the view follows the
 * content (it re-fits when the drawing changes size).
 */
export function Viewport({
  content,
  padding = 40,
  className,
  children,
  onBackgroundClick,
  onPointerWorld,
  cursor,
  controls,
  label,
}: ViewportProps) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [manual, setManual] = useState<View | null>(null);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e!.contentRect;
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitted = useMemo(() => fitView(content, size.w, size.h, padding), [content, size.w, size.h, padding]);
  // a manual view survives resizes by keeping its scale and the centre point
  const view: View = manual ? { ...manual, width: size.w, height: size.h } : fitted;
  const viewRef = useRef(view);
  viewRef.current = view;

  // wheel zoom (non-passive listener so the page doesn't scroll)
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setManual(zoomAt(viewRef.current, Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // drag to pan, two fingers to pinch; a press without movement is a click
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; start: View; x: number; y: number; dist?: number } | null>(null);
  const local = (e: React.PointerEvent) => {
    const r = host.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget && !(e.target as Element).hasAttribute('data-bg')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        moved: true,
        start: viewRef.current,
        x: (a!.x + b!.x) / 2,
        y: (a!.y + b!.y) / 2,
        dist: Math.hypot(a!.x - b!.x, a!.y - b!.y),
      };
    } else gesture.current = { moved: false, start: viewRef.current, x: p.x, y: p.y };
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = local(e);
    onPointerWorld?.(toWorld(viewRef.current, p.x, p.y));
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2 && g.dist) {
      const [a, b] = [...pointers.current.values()];
      const mx = (a!.x + b!.x) / 2;
      const my = (a!.y + b!.y) / 2;
      const k = Math.hypot(a!.x - b!.x, a!.y - b!.y) / g.dist;
      const z = zoomAt(g.start, k, g.x, g.y);
      setManual({ ...z, tx: z.tx + mx - g.x, ty: z.ty + my - g.y });
      return;
    }
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    g.moved = true;
    setManual({ ...g.start, tx: g.start.tx + dx, ty: g.start.ty + dy });
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size) return;
    gesture.current = null;
    if (g && !g.moved) {
      const p = local(e);
      onBackgroundClick?.(toWorld(viewRef.current, p.x, p.y), viewRef.current);
    }
  };

  return (
    <div ref={host} className={cn('relative touch-none overflow-hidden rounded-lg bg-[var(--draw-bg)] select-none', className)}>
      {size.w > 0 && size.h > 0 && (
        <svg
          width={size.w}
          height={size.h}
          role="img"
          aria-label={label}
          className="block"
          style={{ cursor: cursor ?? 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => onPointerWorld?.(null)}
        >
          <ViewContext.Provider value={view}>{children}</ViewContext.Provider>
        </svg>
      )}
      <div className="absolute top-2 right-2 flex gap-1">
        {controls}
        <Button
          size="icon"
          variant="secondary"
          className="size-8 shadow-sm"
          onClick={() => setManual(null)}
          aria-label="Fit drawing"
          title="Fit drawing"
        >
          <Maximize2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}
