import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

/**
 * A row of labelled fields whose inputs line up even when a label wraps to more lines: the row
 * has a label track and a control track, and each field spans both through CSS subgrid.
 */
export function FieldRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <div className="grid grid-rows-[auto_auto] gap-x-2 gap-y-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {children}
    </div>
  );
}

/** One labelled control; inside a {@link FieldRow} its label sits at the bottom of the label track. */
export function Field({ label, htmlFor, children }: { label: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="row-span-2 grid grid-rows-subgrid">
      <Label htmlFor={htmlFor} className="self-end leading-snug">
        {label}
      </Label>
      {children}
    </div>
  );
}
