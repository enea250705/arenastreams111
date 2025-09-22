require('dotenv').config();
const { getSupabaseClient } = require('./lib/supabase');

async function setupSchema() {
  const schema = `
-- Matches table (for admin-created matches)
create table if not exists public.matches (
  id text primary key,
  sport text not null,
  teamA text not null,
  teamB text not null,
  competition text not null,
  date timestamptz not null,
  embed_urls jsonb default '[]'::jsonb,
  teamABadge text,
  teamBBadge text,
  status text default 'upcoming',
  slug text unique,
  source text default 'admin',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Overrides table (extra servers for fetched matches)
create table if not exists public.overrides (
  slug text primary key,
  embed_urls jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table public.matches enable row level security;
alter table public.overrides enable row level security;

-- Triggers for updated_at
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_matches_updated_at on public.matches;
create trigger set_matches_updated_at before update on public.matches
for each row execute function public.set_updated_at();

drop trigger if exists set_overrides_updated_at on public.overrides;
create trigger set_overrides_updated_at before update on public.overrides
for each row execute function public.set_updated_at();
`;

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.rpc('exec_sql', { sql: schema });
    
    if (error) throw error;
    console.log('✅ Supabase schema setup completed!');
  } catch (error) {
    console.error('❌ Error setting up schema:', error.message);
    console.log('Please run the SQL manually in Supabase SQL Editor:');
    console.log(schema);
  }
}

setupSchema();
