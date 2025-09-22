const { getSupabaseClient } = require('./lib/supabase');

async function checkMatchServers() {
  const slug = 'ballon-d-or-2025-vs-live-live-2025-09-22';
  
  try {
    const supabase = getSupabaseClient();
    
    console.log(`🔍 Checking match: ${slug}`);
    
    // Check if match exists in matches table
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .eq('slug', slug)
      .single();
    
    if (matchError && matchError.code !== 'PGRST116') {
      console.error('❌ Error checking matches table:', matchError);
    } else if (match) {
      console.log('✅ Match found in matches table:');
      console.log('  - ID:', match.id);
      console.log('  - Teams:', match.teamA, 'vs', match.teamB);
      console.log('  - Sport:', match.sport);
      console.log('  - Date:', match.date);
      console.log('  - Status:', match.status);
      console.log('  - Embed URLs:', match.embed_urls);
      console.log('  - Source:', match.source);
    } else {
      console.log('❌ Match not found in matches table');
    }
    
    // Check if there are overrides for this match
    const { data: override, error: overrideError } = await supabase
      .from('overrides')
      .select('*')
      .eq('slug', slug)
      .single();
    
    if (overrideError && overrideError.code !== 'PGRST116') {
      console.error('❌ Error checking overrides table:', overrideError);
    } else if (override) {
      console.log('✅ Override found for this match:');
      console.log('  - Embed URLs:', override.embed_urls);
      console.log('  - Created:', override.created_at);
      console.log('  - Updated:', override.updated_at);
    } else {
      console.log('❌ No overrides found for this match');
    }
    
    // Check all matches to see if there are similar ones
    const { data: allMatches, error: allMatchesError } = await supabase
      .from('matches')
      .select('slug, teamA, teamB, sport, date')
      .ilike('slug', '%ballon%')
      .limit(10);
    
    if (allMatchesError) {
      console.error('❌ Error checking for similar matches:', allMatchesError);
    } else if (allMatches && allMatches.length > 0) {
      console.log('🔍 Found similar matches:');
      allMatches.forEach(m => {
        console.log(`  - ${m.slug} (${m.teamA} vs ${m.teamB}) - ${m.sport}`);
      });
    } else {
      console.log('❌ No similar matches found');
    }
    
    // Check all overrides to see if there are similar ones
    const { data: allOverrides, error: allOverridesError } = await supabase
      .from('overrides')
      .select('slug, embed_urls')
      .ilike('slug', '%ballon%')
      .limit(10);
    
    if (allOverridesError) {
      console.error('❌ Error checking for similar overrides:', allOverridesError);
    } else if (allOverrides && allOverrides.length > 0) {
      console.log('🔍 Found similar overrides:');
      allOverrides.forEach(o => {
        console.log(`  - ${o.slug} (${o.embed_urls.length} servers)`);
      });
    } else {
      console.log('❌ No similar overrides found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkMatchServers();
