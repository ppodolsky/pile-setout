import { Suspense } from 'react';
import { createHashRouter, Navigate, RouterProvider, useParams } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from './AppShell';
import { TOOLS } from './tools';

function ModeRoute() {
  const { toolId, modeId } = useParams();
  const tool = TOOLS.find((t) => t.id === toolId);
  const mode = tool?.modes.find((m) => m.id === modeId);
  if (!tool) return <Navigate to={`/${TOOLS[0]!.id}/${TOOLS[0]!.modes[0]!.id}`} replace />;
  if (!mode) return <Navigate to={`/${tool.id}/${tool.modes[0]!.id}`} replace />;
  const Element = mode.element;
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
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
      { index: true, element: <Navigate to={`/${TOOLS[0]!.id}/${TOOLS[0]!.modes[0]!.id}`} replace /> },
      { path: ':toolId', element: <ModeRoute /> },
      { path: ':toolId/:modeId', element: <ModeRoute /> },
    ],
  },
]);

export function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <RouterProvider router={router} />
    </TooltipProvider>
  );
}
