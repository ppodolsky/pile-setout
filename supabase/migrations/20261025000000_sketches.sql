-- Sketches saved by signed-in users. Each user sees and changes only their own rows (RLS).
create table if not exists public.sketches (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  tool text not null,
  name text not null default '',
  summary text,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner, id)
);

create index if not exists sketches_owner_tool_updated on public.sketches (owner, tool, updated_at desc);

alter table public.sketches enable row level security;

drop policy if exists "own sketches: read" on public.sketches;
drop policy if exists "own sketches: write" on public.sketches;
create policy "own sketches: read" on public.sketches for select using (auth.uid() = owner);
create policy "own sketches: write" on public.sketches for all using (auth.uid() = owner) with check (auth.uid() = owner);
