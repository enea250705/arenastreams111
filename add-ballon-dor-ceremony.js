require('dotenv').config();
const { getSupabaseClient } = require('./lib/supabase');

async function addBallonDorCeremony() {
  const match = {
    id: 'ballon-d-or-2025',  // Official Streamed.pk ID
    slug: 'fifa-ballon-d-or-ceremony-vs-vs-opponent-live-2025-09-22',  // Your requested slug
    sport: 'football',
    teamA: 'Ballon d\'Or 2025 Ceremony',
    teamB: 'Live',
    competition: 'Ballon d\'Or 2025',
    date: '2025-09-22T18:00:00Z',
    embed_urls: [
      'https://embedsports.top/watch/ballon-d-or-2025/alpha/1'
    ],
    teamABadge: '',
    teamBBadge: '',
    status: 'live',
    source: 'admin',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('matches')
      .insert([match]);
    
    if (error) throw error;
    console.log('✅ Ballon d\'Or ceremony match added successfully!');
    console.log('ID:', match.id);
    console.log('Slug:', match.slug);
    console.log('Embeds:', match.embed_urls);
  } catch (error) {
    console.error('❌ Error adding Ballon d\'Or ceremony:', error.message);
  }
}

addBallonDorCeremony();
