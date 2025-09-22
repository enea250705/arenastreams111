require('dotenv').config();
const { getSupabaseClient } = require('./lib/supabase');

async function addBallonDorSimple() {
  try {
    const supabase = getSupabaseClient();
    
    // First, let's try to add to overrides table (simpler approach)
    const { error: overrideError } = await supabase
      .from('overrides')
      .upsert({
        slug: 'fifa-ballon-d-or-ceremony-vs-vs-opponent-live-2025-09-22',
        embed_urls: ['https://embedsports.top/watch/ballon-d-or-2025/alpha/1'],
        updated_at: new Date().toISOString()
      }, { onConflict: 'slug' });
    
    if (overrideError) {
      console.log('Override failed, trying matches table...');
      throw overrideError;
    }
    
    console.log('✅ Ballon d\'Or ceremony added to overrides successfully!');
    console.log('Slug: fifa-ballon-d-or-ceremony-vs-vs-opponent-live-2025-09-22');
    console.log('Embed: https://embedsports.top/watch/ballon-d-or-2025/alpha/1');
    
  } catch (error) {
    console.error('❌ Error adding Ballon d\'Or ceremony:', error.message);
    console.log('\n📋 Please run this SQL in your Supabase SQL Editor first:');
    console.log(`
-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS public.matches (
  id text PRIMARY KEY,
  sport text NOT NULL,
  teamA text NOT NULL,
  teamB text NOT NULL,
  competition text NOT NULL,
  date timestamptz NOT NULL,
  embed_urls jsonb DEFAULT '[]'::jsonb,
  teamABadge text,
  teamBBadge text,
  status text DEFAULT 'upcoming',
  slug text UNIQUE,
  source text DEFAULT 'admin',
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.overrides (
  slug text PRIMARY KEY,
  embed_urls jsonb NOT NULL,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overrides ENABLE ROW LEVEL SECURITY;
    `);
  }
}

addBallonDorSimple();
