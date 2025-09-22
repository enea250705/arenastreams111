const { getSupabaseClient } = require('./lib/supabase');

async function addOverride() {
  const slug = 'ballon-d-or-2025-vs-live-live-2025-09-22';
  const embedUrls = [
    'https://embedsports.top/embed/alpha/ballon-d-or-2025/1'  // Real embed from embedsports.top
  ];

  try {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('overrides')
      .upsert({ 
        slug, 
        embed_urls: embedUrls, 
        updated_at: now 
      }, { onConflict: 'slug' });
    
    if (error) throw error;
    console.log('✅ Override added successfully for slug:', slug);
    console.log('Added embeds:', embedUrls);
  } catch (error) {
    console.error('❌ Error adding override:', error.message);
  }
}

addOverride();
