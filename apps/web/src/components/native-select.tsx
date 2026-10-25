import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Native <select> styled like the inputs — best on phones (system picker). */
export function NativeSelect({ className, children, ...rest }: React.ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select
        className="h-9 w-full appearance-none rounded-md border border-input bg-transparent py-1 pr-7 pl-2.5 font-mono text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
