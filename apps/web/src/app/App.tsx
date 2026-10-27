import { Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createHashRouter, Navigate, RouterProvider, useParams } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from './AppShell';
import { TOOLS } from './tools';

const LAST_ROUTE = 'buildkit/last-route';

/** Where to open: the tool and mode used last on this device, else the first ones. */
function startRoute(): string {
  const saved = localStorage.getItem(LAST_ROUTE);
  const [toolId, modeId] = saved?.split('/') ?? [];
  const tool = TOOLS.find((t) => t.id === toolId) ?? TOOLS[0]!;
  const mode = tool.modes.find((m) => m.id === modeId) ?? tool.modes[0]!;
  return `/${tool.id}/${mode.id}`;
}

function StartRedirect() {
  return <Navigate to={startRoute()} replace />;
}

function Loading() {
  const { t } = useTranslation();
  return <div className="p-6 text-sm text-muted-foreground">{t('loading')}</div>;
}

function ModeRoute() {
  const { toolId, modeId } = useParams();
  const tool = TOOLS.find((t) => t.id === toolId);
  const mode = tool?.modes.find((m) => m.id === modeId);
  useEffect(() => {
    if (tool && mode) localStorage.setItem(LAST_ROUTE, `${tool.id}/${mode.id}`);
  }, [tool, mode]);
  if (!tool) return <Navigate to={`/${TOOLS[0]!.id}/${TOOLS[0]!.modes[0]!.id}`} replace />;
  if (!mode) return <Navigate to={`/${tool.id}/${tool.modes[0]!.id}`} replace />;
  const Element = mode.element;
  return (
    <Suspense fallback={<Loading />}>
      <Element />
    </Suspense>
  );
}

// hash routing: works on static hosting (GitHub Pages) and offline without server rewrites
const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <StartRedirect /> },
      { path: ':toolId', element: <ModeRoute /> },
      { path: ':toolId/:modeId', element: <ModeRoute /> },
    ],
  },
]);

export function App() {
  // remount on a language switch so every number and date re-formats too
  const { i18n } = useTranslation();
  return (
    <TooltipProvider delayDuration={300}>
      <RouterProvider key={i18n.language} router={router} />
    </TooltipProvider>
  );
}
