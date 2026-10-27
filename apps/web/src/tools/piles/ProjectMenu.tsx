import { Download, FilePlus2, FolderOpen, MoreVertical, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['project', 'common']);
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
    if (out.warnings.length) setNotice({ title: t('menu.saved', { file: out.filename }), lines: out.warnings });
  };

  const openFile = async (f: File) => {
    try {
      const base = newProject();
      const sketchName = f.name.replace(/\.[^.]+$/, '');
      if (/\.json$/i.test(f.name)) {
        const d = JSON.parse(await f.text());
        if (d?.kind !== FILE_KIND || !d.design?.doc || !d.fieldwork?.measurements) throw new Error(t('menu.notPileField'));
        await saveCurrent();
        useProject
          .getState()
          .open(newIdentity(d.name ?? sketchName), { design: d.design, fieldwork: d.fieldwork, view: d.view ?? base.view });
      } else {
        const head = useProject.getState().design.template.head;
        const r = await importDesign(f, { head });
        if (!r) throw new Error(t('menu.unsupported'));
        await saveCurrent();
        const design = { ...designFromTemplate(base.design.template), doc: r.doc, edited: true };
        useProject.getState().open(newIdentity(sketchName), { design, fieldwork: base.fieldwork, view: base.view });
        if (r.warnings.length) setNotice({ title: t('menu.opened', { file: f.name }), lines: r.warnings });
      }
      useCadEditor.getState().select([]);
    } catch (e) {
      setNotice({ title: t('menu.openFailed', { file: f.name }), lines: [(e as Error).message] });
    }
  };

  const importable = FORMATS.filter((x) => x.canImport).flatMap((x) => x.extensions.map((e) => `.${e}`));

  return (
    <>
      <button
        className="hidden max-w-40 truncate rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground md:block"
        onClick={() => setLibrary(true)}
        title={t('menu.sketchesTitle')}
      >
        {name || t('sketch.untitledShort')}
      </button>
      <LibrarySheet open={library} onOpenChange={setLibrary} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('menu.label')}>
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t('menu.savedOnDevice')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setLibrary(true)}>
            <FolderOpen /> {t('menu.sketches')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirm(true)}>
            <FilePlus2 /> {t('sketch.newSketch')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Download /> {t('menu.exportAs')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-64">
              <DropdownMenuItem onSelect={exportNative}>
                {t('menu.nativeFormat')}
                <span className="ml-auto text-xs text-muted-foreground">{t('menu.everything')}</span>
              </DropdownMenuItem>
              {FORMATS.filter((x) => x.canExport).map((x) => (
                <DropdownMenuItem key={x.id} onSelect={() => exportCad(x.id)}>
                  {x.name} (.{x.extensions[0]})
                  <span className="ml-auto text-xs text-muted-foreground">
                    {x.keepsConstraints ? t('menu.parametric') : t('menu.geometry')}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={() => file.current?.click()}>
            <Upload /> {t('menu.openFile')}{' '}
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
            <AlertDialogTitle>{t('newSketchDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('newSketchDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await saveCurrent();
                useProject.getState().reset();
                useCadEditor.getState().select([]);
              }}
            >
              {t('sketch.newSketch')}
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
            <AlertDialogAction onClick={() => setNotice(null)}>{t('common:ok')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
