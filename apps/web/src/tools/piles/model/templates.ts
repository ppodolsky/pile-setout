import type { SketchMeta } from '@/app/library';
import { uid } from '@/lib/id';
import {
  CONTAINER_TEMPLATES,
  containerTemplateName,
  instantiateContainers,
  type BackgroundDrawing,
  type ContainerType,
  type PileDesign,
} from './deps';
import { sketchStore } from './library';
import { useProject } from './store';

/** Library tool id for design templates (kept apart from sketches). */
export const TEMPLATE_TOOL = 'piles-template';

/** What a template brings into a design: background drawings and a pile field. */
export interface TemplateContent {
  readonly backgrounds: readonly BackgroundDrawing[];
  readonly doc: PileDesign;
}

/** A library entry: built-in (generated from containers, takes head / inset) or saved by the user. */
export type TemplateEntry =
  | { readonly kind: 'builtin'; readonly id: string; readonly name: string; readonly containers: readonly ContainerType[] }
  | { readonly kind: 'user'; readonly id: string; readonly name: string; readonly updatedAt: number };

export const builtInTemplates = (): TemplateEntry[] =>
  CONTAINER_TEMPLATES.map((t) => ({ kind: 'builtin', id: t.id, name: containerTemplateName(t.containers), containers: t.containers }));

export async function userTemplates(): Promise<TemplateEntry[]> {
  const list: SketchMeta[] = await sketchStore().list(TEMPLATE_TOOL);
  return list.map((m) => ({ kind: 'user', id: m.id, name: m.name, updatedAt: m.updatedAt }));
}

/** The content of a template, ready to insert (fresh background ids). */
export async function instantiate(entry: TemplateEntry, piles: { head: number; inset: number }): Promise<TemplateContent | null> {
  if (entry.kind === 'builtin') {
    const { background, design } = instantiateContainers(entry.containers, piles, uid('bg'));
    return { backgrounds: [background], doc: design };
  }
  const stored = await sketchStore().load<TemplateContent>(entry.id);
  if (!stored) return null;
  return { backgrounds: stored.data.backgrounds.map((b) => ({ ...b, id: uid('bg') })), doc: stored.data.doc };
}

/** Saves the current design (drawings + pile field, no field work) as a template. */
export async function saveAsTemplate(name: string): Promise<void> {
  const { backgrounds, doc } = useProject.getState().design;
  const data: TemplateContent = { backgrounds, doc };
  await sketchStore().save({ id: uid('t'), tool: TEMPLATE_TOOL, name, updatedAt: Date.now(), data });
}

export const deleteTemplate = (id: string): Promise<void> => sketchStore().remove(id);
