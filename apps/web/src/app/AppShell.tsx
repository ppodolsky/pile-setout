import { Monitor, Moon, Sun } from 'lucide-react';
import { NavLink, Outlet, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { AccountMenu } from './AccountMenu';
import { useTheme, type ThemePref } from './theme';
import { TOOLS } from './tools';

/** Top bar: product, current tool, its modes (Design / Field work …), project menu and theme. */
export function AppShell() {
  const { toolId } = useParams();
  const tool = TOOLS.find((t) => t.id === toolId) ?? TOOLS[0]!;
  const [theme, setTheme] = useTheme();
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const ProjectMenu = tool.ProjectMenu;

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-30 border-b bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/70">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="size-7 rounded-md" />
            <div className="hidden min-w-0 leading-tight sm:block">
              <div className="truncate text-sm font-semibold">{tool.name}</div>
              <div className="text-xs text-muted-foreground">Buildkit</div>
            </div>
          </div>

          <nav className="mx-auto flex rounded-lg bg-muted p-1" aria-label="Mode">
            {tool.modes.map((m) => (
              <NavLink
                key={m.id}
                to={`/${tool.id}/${m.id}`}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors sm:px-3.5',
                    isActive ? 'bg-card text-foreground shadow-sm' : 'hover:text-foreground',
                  )
                }
              >
                <m.icon className="size-4" />
                {m.name}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            {ProjectMenu && <ProjectMenu />}
            <AccountMenu />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Theme">
                  <ThemeIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePref)}>
                  <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
