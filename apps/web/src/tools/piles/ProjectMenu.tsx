import { Download, FilePlus2, FolderOpen, MoreVertical, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FORMATS, type FormatId } from '@buildkit/interop';
import { useCadEditor } from '@/cad';
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LibrarySheet } from './LibrarySheet';
import { exportDesign, importDesign } from './model/interop';
import { saveCurrent, startAutosave } from './model/library';
import { designFromTemplate, newProject } from './model/project';
import { newIdentity, useProject } from './model/store';

const FILE_KIND = 'buildkit.pile-field';

function download(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Project actions: sketches, new, export to native / CAD formats, open files. Saved automatically. */
export function ProjectMenu() {
  const [confirm, setConfirm] = useState(false);
  const [library, setLibrary] = useState(false);
  const [notice, setNotice] = useState<{ title: string; lines: string[] } | null>(null);
  const name = useProject((s) => s.sketch.name);
  useEffect(() => startAutosave(), []);
  const file = useRef<HTMLInputElement>(null);

  const exportNative = () => {
    const { design, fieldwork, view, sketch } = useProject.getState();
    const json = JSON.stringify({ kind: FILE_KIND, version: 4, name: sketch.name, design, fieldwork, view }, null, 2);
    download(new Blob([json], { type: 'application/json' }), `${(sketch.name || 'pile-field').replace(/[^\w.-]+/g, '-')}.json`);
  };

  const exportCad = (format: FormatId) => {
    const { design, sketch } = useProject.getState();
    const out = exportDesign(design.doc, sketch.name, format);
    download(out.blob, out.filename);
    if (out.warnings.length) setNotice({ title: `Saved ${out.filename}`, lines: out.warnings });
  };

  const openFile = async (f: File) => {
    try {
      const base = newProject();
      const sketchName = f.name.replace(/\.[^.]+$/, '');
      if (/\.json$/i.test(f.name)) {
        const d = JSON.parse(await f.text());
        if (d?.kind !== FILE_KIND || !d.design?.doc || !d.fieldwork?.measurements) throw new Error('not a Buildkit pile field file');
        await saveCurrent();
        useProject
          .getState()
          .open(newIdentity(d.name ?? sketchName), { design: d.design, fieldwork: d.fieldwork, view: d.view ?? base.view });
      } else {
        const head = useProject.getState().design.template.head;
        const r = await importDesign(f, { head });
        if (!r) throw new Error('this file type cannot be opened');
        await saveCurrent();
        const design = { ...designFromTemplate(base.design.template), doc: r.doc, edited: true };
        useProject.getState().open(newIdentity(sketchName), { design, fieldwork: base.fieldwork, view: base.view });
        if (r.warnings.length) setNotice({ title: `Opened ${f.name}`, lines: r.warnings });
      }
      useCadEditor.getState().select([]);
    } catch (e) {
      setNotice({ title: `Could not open ${f.name}`, lines: [(e as Error).message] });
    }
  };

  const importable = FORMATS.filter((x) => x.canImport).flatMap((x) => x.extensions.map((e) => `.${e}`));

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
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Saved automatically on this device</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setLibrary(true)}>
            <FolderOpen /> Sketches…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirm(true)}>
            <FilePlus2 /> New sketch
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Download /> Export as
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-64">
              <DropdownMenuItem onSelect={exportNative}>
                Buildkit project (.json)
                <span className="ml-auto text-xs text-muted-foreground">everything</span>
              </DropdownMenuItem>
              {FORMATS.filter((x) => x.canExport).map((x) => (
                <DropdownMenuItem key={x.id} onSelect={() => exportCad(x.id)}>
                  {x.name} (.{x.extensions[0]})
                  <span className="ml-auto text-xs text-muted-foreground">{x.keepsConstraints ? 'parametric' : 'geometry'}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={() => file.current?.click()}>
            <Upload /> Open file…{' '}
            <span className="ml-auto text-xs text-muted-foreground">json, {importable.map((e) => e.slice(1)).join(', ')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={file}
        type="file"
        accept={['.json', 'application/json', ...importable].join(',')}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void openFile(f);
        }}
      />
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new sketch?</AlertDialogTitle>
            <AlertDialogDescription>The current one stays in Sketches… — you can come back to it any time.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await saveCurrent();
                useProject.getState().reset();
                useCadEditor.getState().select([]);
              }}
            >
              New sketch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!notice} onOpenChange={(v) => !v && setNotice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{notice?.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ul className="list-disc space-y-1 pl-5 text-left">
                {notice?.lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setNotice(null)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
