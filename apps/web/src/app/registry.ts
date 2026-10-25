import type { ComponentType, LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * A tool is a self-contained feature of the product (pile field, later: slabs, foundations, …).
 * Each tool owns its state, drawings and modes; the shell only knows this descriptor.
 */
export interface ToolMode {
  readonly id: string;
  readonly name: string;
  readonly icon: LucideIcon;
  readonly element: LazyExoticComponent<ComponentType> | ComponentType;
}

export interface ToolDescriptor {
  readonly id: string;
  readonly name: string;
  readonly icon: LucideIcon;
  readonly description: string;
  readonly modes: readonly ToolMode[];
  /** Project-level actions shown in the top bar menu (e.g. "New project"). */
  readonly ProjectMenu?: ComponentType;
}
