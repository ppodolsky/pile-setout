import { pileFieldTool } from '@/tools/piles';
import type { ToolDescriptor } from './registry';

/** All tools of the product. Add a new one here and it gets a route and a place in the shell. */
export const TOOLS: readonly ToolDescriptor[] = [pileFieldTool];
