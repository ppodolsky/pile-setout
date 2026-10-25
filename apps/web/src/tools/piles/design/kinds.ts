import { GitCommitHorizontal, Pin, Waypoints } from 'lucide-react';
import type { PileKind } from '@buildkit/pile-field';

export const KIND_LABEL: Record<PileKind, string> = { fixed: 'Fixed', between: 'Between', polar: 'Distance + angle' };
export const KIND_ICON = { fixed: Pin, between: GitCommitHorizontal, polar: Waypoints } as const;
