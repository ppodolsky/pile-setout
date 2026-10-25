import { Download, FilePlus2, MoreVertical, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
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
import { useEditor } from './model/editor';
import { useProject } from './model/store';

const FILE_KIND = 'buildkit.pile-field';

/** Project actions: new, export to a file, import from a file. Saved automatically on this device. */
export function ProjectMenu() {
  const [confirm, setConfirm] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const exportFile = () => {
    const { design, fieldwork, view } = useProject.getState();
    const blob = new Blob([JSON.stringify({ kind: FILE_KIND, version: 2, design, fieldwork, view }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pile-field-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importFile = async (f: File) => {
    try {
      const d = JSON.parse(await f.text());
      if (d?.kind !== FILE_KIND || !d.design?.piles || !d.fieldwork?.measurements) throw new Error('not a pile field project');
      useProject.setState({ design: d.design, fieldwork: d.fieldwork, ...(d.view ? { view: d.view } : {}) });
      useProject.temporal.getState().clear();
      useEditor.getState().select(null);
    } catch (e) {
      alert(`Could not open this file: ${(e as Error).message}`);
    }
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Project menu">
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Saved automatically on this device</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setConfirm(true)}>
            <FilePlus2 /> New project
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
                useProject.getState().reset();
                useEditor.getState().select(null);
              }}
            >
              New project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
