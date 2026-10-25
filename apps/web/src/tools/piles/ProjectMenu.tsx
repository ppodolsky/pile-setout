import { Download, FilePlus2, FolderOpen, MoreVertical, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCadEditor } from '@/cad';
import { LibrarySheet } from './LibrarySheet';
import { saveCurrent, startAutosave } from './model/library';
import { newIdentity, useProject } from './model/store';

const FILE_KIND = 'buildkit.pile-field';

/** Project actions: new, export to a file, import from a file. Saved automatically on this device. */
export function ProjectMenu() {
  const [confirm, setConfirm] = useState(false);
  const [library, setLibrary] = useState(false);
  const name = useProject((s) => s.sketch.name);
  useEffect(() => startAutosave(), []);
  const file = useRef<HTMLInputElement>(null);
  const exportFile = () => {
    const { design, fieldwork, view, sketch } = useProject.getState();
    const blob = new Blob([JSON.stringify({ kind: FILE_KIND, version: 4, name: sketch.name, design, fieldwork, view }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(sketch.name || 'pile-field').replace(/[^\w.-]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importFile = async (f: File) => {
    try {
      const d = JSON.parse(await f.text());
      if (d?.kind !== FILE_KIND || !d.design?.doc || !d.fieldwork?.measurements) throw new Error('not a pile field project (version 4)');
      saveCurrent();
      useProject
        .getState()
        .open(newIdentity(d.name ?? f.name.replace(/\.json$/, '')), { design: d.design, fieldwork: d.fieldwork, view: d.view });
      useCadEditor.getState().select([]);
    } catch (e) {
      alert(`Could not open this file: ${(e as Error).message}`);
    }
  };
  return (
    <>
      <button
        className="hidden max-w-40 truncate rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground md:block"
        onClick={() => setLibrary(true)}
        title="Sketches"
      >
        {name || 'Untitled'}
      </button>
      <LibrarySheet open={library} onOpenChange={setLibrary} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Project menu">
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Saved automatically on this device</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setLibrary(true)}>
            <FolderOpen /> Sketches…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirm(true)}>
            <FilePlus2 /> New sketch
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportFile}>
            <Download /> Export to file
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => file.current?.click()}>
            <Upload /> Open file…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
      />
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new project?</AlertDialogTitle>
            <AlertDialogDescription>
              The design and all measurements saved on this device are cleared. Export to a file first if you want to keep them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                saveCurrent();
                useProject.getState().reset();
                useCadEditor.getState().select([]);
              }}
            >
              New sketch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
