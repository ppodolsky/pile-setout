import { createContext, useContext } from 'react';
import type { Box, Vec2 } from '@buildkit/geometry';

/**
 * World → screen mapping of a drawing. World units are millimetres with Y pointing up (CAD
 * convention); screen is SVG pixels with Y down. Everything is drawn in screen space so lines
 * stay crisp and text upright at any zoom.
 */
export interface View {
  /** Pixels per millimetre. */
  readonly s: number;
  readonly tx: number;
  readonly ty: number;
  readonly width: number;
  readonly height: number;
}

export const toScreen = (v: View, p: Vec2): Vec2 => ({ x: v.tx + p.x * v.s, y: v.ty - p.y * v.s });
export const toWorld = (v: View, x: number, y: number): Vec2 => ({ x: (x - v.tx) / v.s, y: (v.ty - y) / v.s });

/** The view that fits `box` into a width × height area with `pad` pixels around it. */
export function fitView(box: Box, width: number, height: number, pad: number): View {
  const w = Math.max(box.maxX - box.minX, 1);
  const h = Math.max(box.maxY - box.minY, 1);
  const s = Math.max(1e-4, Math.min((width - 2 * pad) / w, (height - 2 * pad) / h));
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  return { s, tx: width / 2 - cx * s, ty: height / 2 + cy * s, width, height };
}

/** Zooms by `k` keeping the screen point (x, y) fixed. */
export function zoomAt(v: View, k: number, x: number, y: number): View {
  const s = Math.min(Math.max(v.s * k, 1e-4), 50);
  const r = s / v.s;
  return { ...v, s, tx: x - (x - v.tx) * r, ty: y - (y - v.ty) * r };
}

export const ViewContext = createContext<View | null>(null);

export function useView(): View {
  const v = useContext(ViewContext);
  if (!v) throw new Error('useView must be used inside <Viewport>');
  return v;
}
