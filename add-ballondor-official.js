require('dotenv').config();
const { getSupabaseClient } = require('./lib/supabase');

async function addBallonDorOfficial() {
  try {
    const supabase = getSupabaseClient();
    
    // Add to overrides table with the official Streamed.pk slug
    const { error: overrideError } = await supabase
      .from('overrides')
      .upsert({
        slug: 'ballon-d-or-2025',  // Official Streamed.pk slug
        embed_urls: ['https://embedsports.top/watch/ballon-d-or-2025/alpha/1'],
        updated_at: new Date().toISOString()
      }, { onConflict: 'slug' });
    
    if (overrideError) {
      console.log('Override failed, trying matches table...');
      throw overrideError;
    }
    
    console.log('✅ Ballon d\'Or ceremony added with official slug!');
    console.log('Official Slug: ballon-d-or-2025');
    console.log('Embed: https://embedsports.top/watch/ballon-d-or-2025/alpha/1');
    console.log('URL: http://localhost:4000/match/ballon-d-or-2025');
    
  } catch (error) {
    console.error('❌ Error adding Ballon d\'Or ceremony:', error.message);
  }
}

addBallonDorOfficial();
