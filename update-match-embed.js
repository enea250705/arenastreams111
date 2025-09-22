require('dotenv').config();
const { getSupabaseClient } = require('./lib/supabase');

async function updateMatchEmbed() {
  const slug = 'fifa-ballon-d-or-ceremony-vs-live-live-2025-09-22';  // Or change to 'ballon-d-or-2025-vs-live-live-2025-09-22' if needed
  const newEmbedUrls = [
    'https://embedsports.top/watch/ballon-d-or-2025/alpha/1'  // New embed URL
  ];

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('matches')
      .update({ 
        embed_urls: newEmbedUrls,
        updated_at: new Date().toISOString()
      })
      .eq('slug', slug);
    
    if (error) throw error;
    console.log('✅ Match embed updated successfully!');
    console.log('Slug:', slug);
    console.log('New embeds:', newEmbedUrls);
  } catch (error) {
    console.error('❌ Error updating match embed:', error.message);
  }
}

updateMatchEmbed();
