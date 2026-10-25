import { lazy } from 'react';
import { DraftingCompass, HardHat, LandPlot } from 'lucide-react';
import type { ToolDescriptor } from '@/app/registry';
import { ProjectMenu } from './ProjectMenu';

/** Pile field: design a pile plan under containers, then set it out on site. */
export const pileFieldTool: ToolDescriptor = {
  id: 'piles',
  name: 'Pile field',
  icon: LandPlot,
  description: 'Pile plans under containers: design, then set out on site with a tape.',
  modes: [
    { id: 'design', name: 'Design', icon: DraftingCompass, element: lazy(() => import('./design/DesignMode')) },
    { id: 'fieldwork', name: 'Field work', icon: HardHat, element: lazy(() => import('./fieldwork/FieldworkMode')) },
  ],
  ProjectMenu,
};
