import { Copy, FilePlus2, FolderOpen, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SketchMeta } from '@/app/library';
import { useCadEditor } from '@/cad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { uid } from '@/lib/id';
import { cn } from '@/lib/utils';
import { useAuth } from '@/app/backend/auth';
import { duplicateSketch, openSketch, saveCurrent, sketchStore, TOOL_ID } from './model/library';
import { useProject } from './model/store';

const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** The sketch library: rename the current sketch, open / duplicate / delete others, start a new one. */
export function LibrarySheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const current = useProject((s) => s.sketch);
  const account = useAuth((s) => s.account);
  const [items, setItems] = useState<SketchMeta[]>([]);
  const refresh = async () => {
    await saveCurrent();
    setItems(await sketchStore().list(TOOL_ID));
  };
  useEffect(() => {
    if (open) void refresh();
  }, [open, current, account]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Sketches</SheetTitle>
          <SheetDescription>
            {account
              ? `Saved automatically and synced to ${account.email}.`
              : 'Saved automatically in this browser. Sign in to sync across devices, or export a file.'}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 overflow-y-auto px-4 pb-6">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="sketch-name">
              This sketch
            </label>
            <Input id="sketch-name" value={current.name} onChange={(e) => useProject.getState().rename(e.target.value)} />
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              await saveCurrent();
              useProject.getState().reset();
              useCadEditor.getState().select([]);
              await refresh();
            }}
          >
            <FilePlus2 /> New sketch
          </Button>
          <ul className="divide-y rounded-lg border">
            {items.map((m) => (
              <li key={m.id} className={cn('flex items-center gap-2 p-2.5', m.id === current.id && 'bg-accent/60')}>
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={async () => {
                    if (m.id !== current.id) {
                      await openSketch(m.id);
                      useCadEditor.getState().select([]);
                    }
                    onOpenChange(false);
                  }}
                >
                  <div className="truncate text-sm font-medium">
                    {m.name || 'Untitled'}{' '}
                    {m.id === current.id && <span className="text-xs font-normal text-muted-foreground">(open)</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.summary} · {when(m.updatedAt)}
                  </div>
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Open ${m.name}`}
                  onClick={async () => {
                    await openSketch(m.id);
                    useCadEditor.getState().select([]);
                    onOpenChange(false);
                  }}
                  disabled={m.id === current.id}
                >
                  <FolderOpen />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Duplicate ${m.name}`}
                  onClick={async () => {
                    await duplicateSketch(m.id, uid('s'));
                    await refresh();
                  }}
                >
                  <Copy />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete ${m.name}`}
                  className="text-muted-foreground hover:text-destructive"
                  disabled={m.id === current.id}
                  onClick={async () => {
                    if (!confirm(`Delete “${m.name}”? This cannot be undone.`)) return;
                    await sketchStore().remove(m.id);
                    await refresh();
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
