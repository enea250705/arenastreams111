const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const axios = require('axios');
const handlebars = require('handlebars');
const { minify } = require('html-minifier-terser');
const fs = require('fs').promises;
const http = require('http');

// Register Handlebars helpers
handlebars.registerHelper('json', function(context) {
  return new handlebars.SafeString(JSON.stringify(context));
});

const app = express();
const PORT = process.env.PORT || 3000;

// AdBlock tracking system
const adblockStats = {
  totalVisits: 0,
  adblockVisits: 0,
  cleanVisits: 0,
  dailyStats: {},
  lastReset: new Date().toISOString().split('T')[0]
};

// Reset daily stats if new day
function resetDailyStatsIfNeeded() {
  const today = new Date().toISOString().split('T')[0];
  if (adblockStats.lastReset !== today) {
    adblockStats.dailyStats = {};
    adblockStats.lastReset = today;
  }
}

// Track AdBlock visits
function trackAdblockVisit(isAdblock) {
  resetDailyStatsIfNeeded();
  const today = new Date().toISOString().split('T')[0];
  
  adblockStats.totalVisits++;
  if (isAdblock) {
    adblockStats.adblockVisits++;
    console.log(`🚫 AdBlock visit tracked - Total: ${adblockStats.totalVisits}, AdBlock: ${adblockStats.adblockVisits}`);
  } else {
    adblockStats.cleanVisits++;
    console.log(`✅ Clean visit tracked - Total: ${adblockStats.totalVisits}, Clean: ${adblockStats.cleanVisits}`);
  }
  
  if (!adblockStats.dailyStats[today]) {
    adblockStats.dailyStats[today] = { adblock: 0, clean: 0 };
  }
  
  if (isAdblock) {
    adblockStats.dailyStats[today].adblock++;
  } else {
    adblockStats.dailyStats[today].clean++;
  }
  
  console.log(`📊 Daily stats for ${today}:`, adblockStats.dailyStats[today]);
}

// Get AdBlock statistics
function getAdblockStats() {
  resetDailyStatsIfNeeded();
  return {
    ...adblockStats,
    adblockPercentage: adblockStats.totalVisits > 0 ? 
      Math.round((adblockStats.adblockVisits / adblockStats.totalVisits) * 100) : 0,
    cleanPercentage: adblockStats.totalVisits > 0 ? 
      Math.round((adblockStats.cleanVisits / adblockStats.totalVisits) * 100) : 0
  };
}


// Advanced Security Headers for 11/10 SEO
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://fonts.googleapis.com"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.tailwindcss.com",
        // Ads / partners
        "https://fpyf8.com",
        "https://kt.restowelected.com",
        "https://np.mournersamoa.com",
        "https://madurird.com",
        "https://al5sm.com",
        "https://shoukigaigoors.net",
        "https://tzegilo.com",
        // Google Analytics / Tag Manager
        "https://www.googletagmanager.com",
        "https://www.google-analytics.com"
      ],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      frameSrc: ["'self'", "https:", "http:"],
      connectSrc: [
        "'self'",
        "https:",
        "http:",
        // Google Analytics beacons
        "https://www.google-analytics.com"
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  // Advanced security headers
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  // Performance headers
  dnsPrefetchControl: { allow: true },
  frameguard: { action: 'deny' }
}));

// Advanced compression for Core Web Vitals
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    try {
      // Do not compress Server-Sent Events (viewer counts)
      const isSse = (req.path && req.path.startsWith('/api/viewers')) ||
                    (req.headers && req.headers.accept && req.headers.accept.includes('text/event-stream'));
      if (isSse) return false;
      if (req.headers['x-no-compression']) return false;
    } catch (e) {}
    return compression.filter(req, res);
  }
}));

// Cache control for static assets
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1y',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    if (path.endsWith('.css') || path.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      // Discourage source inspection and disable source maps
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (path.endsWith('.map')) {
        res.setHeader('Cache-Control', 'no-store');
      }
    }
  }
}));

// Serve a tiny 1x1 GIF at a common ad path so the adblock probe doesn't 404
app.get('/ads/ad.gif', (req, res) => {
  try {
    const base64Gif = 'R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
    const buf = Buffer.from(base64Gif, 'base64');
    res.set({
      'Content-Type': 'image/gif',
      'Cache-Control': 'public, max-age=31536000, immutable'
    });
    res.end(buf);
  } catch (e) {
    res.status(204).end();
  }
});

// Serve a test script for adblock detection
app.get('/ads/test.js', (req, res) => {
  res.set({
    'Content-Type': 'application/javascript',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.send('// Adblock detection test script\nwindow.adblockTest = true;');
});

// HTML minification middleware (after static, before routes)
app.use(async (req, res, next) => {
  // Only minify HTML responses
  const send = res.send.bind(res);
  res.send = async (body) => {
    try {
      if (typeof body === 'string' && body.trim().startsWith('<!DOCTYPE html')) {
        const minified = await minify(body, {
          collapseWhitespace: true,
          removeComments: true,
          removeRedundantAttributes: true,
          removeEmptyAttributes: true,
          minifyCSS: true,
          minifyJS: false,
          keepClosingSlash: true,
          sortAttributes: true,
          sortClassName: true
        });
        return send(minified);
      }
    } catch (e) {
      console.warn('HTML minify failed, sending original:', e.message);
    }
    return send(body);
  };
  next();
});

// Serve service worker from root
app.get('/sw.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.set('Service-Worker-Allowed', '/');
    res.sendFile(path.join(__dirname, 'sw.js'));
});

// Serve custom ad protection service worker
app.get('/sw-custom.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.set('Service-Worker-Allowed', '/');
    res.sendFile(path.join(__dirname, 'sw-custom.js'));
});

// Serve adblock-specific service worker
app.get('/sw.adblock.js', (req, res) => {
  res.set('Content-Type', 'application/javascript');
  res.set('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, 'sw.adblock.js'));
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cache-busting middleware for Cloudflare Pages
app.use((req, res, next) => {
  // Disable caching for HTML pages to ensure updates are visible
  if (req.path === '/' || req.path.match(/^\/(football|basketball|tennis|ufc|rugby|baseball|american-football|cricket|motor-sports|admin|match|privacy|terms)(adblock)?$/)) {
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Last-Modified': new Date().toUTCString(),
      'ETag': `"${Date.now()}"`
    });
  }
  next();
});

// Import routes
const matchRoutes = require('./routes/matches');
const adminRoutes = require('./routes/admin');

// Use routes
app.use('/api/matches', matchRoutes);

// Simple HTTP Basic Auth for admin
const ADMIN_USER = process.env.ADMIN_USER || process.env.ADMIN_USERNAME;
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.ADMIN_PASSWORD;

function adminAuth(req, res, next) {
  try {
    if (!ADMIN_USER || !ADMIN_PASS) {
      console.warn('⚠️ ADMIN_USER/ADMIN_PASS not set. Admin is locked. Set env vars to enable access.');
      res.set('WWW-Authenticate', 'Basic realm="Admin"');
      return res.status(401).send('Admin locked. Set ADMIN_USER and ADMIN_PASS.');
    }
    const header = req.headers['authorization'] || '';
    const token = header.split(' ')[1] || '';
    const decoded = Buffer.from(token, 'base64').toString();
    const sep = decoded.indexOf(':');
    const user = sep >= 0 ? decoded.slice(0, sep) : '';
    const pass = sep >= 0 ? decoded.slice(sep + 1) : '';
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Authentication required');
  } catch (e) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Authentication required');
  }
}

app.use('/admin', adminAuth, adminRoutes);

// Streamed.pk API integration
const STREAMED_API_BASE = 'https://streamed.pk/api';

// Streamed.pk API only - no local data
let sportsData = [];

// SEO Configuration
const seoConfig = {
  siteName: 'ArenaStreams',
    siteDescription: 'Watch live sports streaming online free. Football, Basketball, Tennis, UFC, Rugby, Baseball, American Football, Cricket, Motor Sports, Hockey live streams in HD quality.',
  siteUrl: 'https://arenastreams.com',
  defaultImage: 'https://arenastreams.com/images/og-default.jpg',
  twitterHandle: '@ArenaStreams',
  sports: {
    football: {
      name: 'Football',
      description: 'Watch football live streams online free. Premier League, Champions League, La Liga, Serie A, Bundesliga matches.',
      keywords: 'football live stream, soccer streaming, premier league live, champions league stream, football matches online',
      image: 'https://arenastreams.com/images/football-og.jpg'
    },
    basketball: {
      name: 'Basketball',
      description: 'Watch basketball live streams online free. NBA games, college basketball, international basketball matches.',
      keywords: 'basketball live stream, NBA streaming, basketball games live, NBA live stream free',
      image: 'https://arenastreams.com/images/basketball-og.jpg'
    },
    tennis: {
      name: 'Tennis',
      description: 'Watch tennis live streams online free. Grand Slam tournaments, ATP, WTA matches, Wimbledon, US Open.',
      keywords: 'tennis live stream, tennis streaming, grand slam live, Wimbledon live stream',
      image: 'https://arenastreams.com/images/tennis-og.jpg'
    },
    ufc: {
      name: 'UFC',
      description: 'Watch UFC live streams online free. MMA fights, UFC events, boxing matches, combat sports.',
      keywords: 'UFC live stream, MMA streaming, UFC fights live, MMA fights free',
      image: 'https://arenastreams.com/images/ufc-og.jpg'
    },
    rugby: {
      name: 'Rugby',
      description: 'Watch rugby live streams online free. Six Nations, Rugby World Cup, Premiership, international rugby.',
      keywords: 'rugby live stream, rugby streaming, six nations live, rugby world cup stream',
      image: 'https://arenastreams.com/images/rugby-og.jpg'
    },
    baseball: {
      name: 'Baseball',
      description: 'Watch baseball live streams online free. MLB games, World Series, baseball matches, baseball streaming.',
      keywords: 'baseball live stream, MLB streaming, baseball games live, MLB live stream free',
      image: 'https://arenastreams.com/images/baseball-og.jpg'
    },
    'american-football': {
      name: 'American Football',
      description: 'Watch American Football live streams online free. NFL games, Super Bowl, college football, NFL streaming.',
      keywords: 'NFL live stream, American football streaming, NFL games live, Super Bowl live stream, college football live',
      image: 'https://arenastreams.com/images/americanfootball-og.jpg'
    },
    cricket: {
      name: 'Cricket',
      description: 'Watch cricket live streams online free. IPL, World Cup, Test matches, ODI, T20 cricket matches.',
      keywords: 'cricket live stream, cricket streaming, IPL live stream, cricket world cup, test match live, ODI cricket',
      image: 'https://arenastreams.com/images/cricket-og.jpg'
    },
    'motor-sports': {
      name: 'Motor Sports',
      description: 'Watch motor sports live streams online free. Formula 1, MotoGP, NASCAR, IndyCar, Rally racing live streams.',
      keywords: 'motor sports live stream, F1 live stream, MotoGP live stream, NASCAR live stream, Formula 1 streaming, racing live',
      image: 'https://arenastreams.com/images/motorsports-og.jpg'
    },
    hockey: {
      name: 'Hockey',
      description: 'Watch hockey live streams online free. NHL games, Stanley Cup, college hockey, international hockey matches.',
      keywords: 'hockey live stream, NHL streaming, hockey games live, NHL live stream free, Stanley Cup live, college hockey',
      image: 'https://arenastreams.com/images/hockey-og.jpg'
    }
  }
};

// Initialize sports data from API only
async function initializeData() {
  try {
    console.log('🔄 Initializing with Streamed.pk API only...');
    
    // Fetch sports from streamed.pk API
    await fetchSportsFromAPI();
    
    console.log(`✅ Initialized with ${sportsData.length} sports from Streamed.pk`);
  } catch (error) {
    console.error('Error initializing data:', error);
  }
}

// Fetch sports from streamed.pk API
async function fetchSportsFromAPI() {
  try {
    console.log('🔄 Fetching sports from Streamed.pk API...');
    
    const sportsResponse = await axios.get(`${STREAMED_API_BASE}/sports`, {
      timeout: 10000
    });
    
    if (sportsResponse.data && Array.isArray(sportsResponse.data)) {
      sportsData = sportsResponse.data;
      console.log(`📊 Found ${sportsData.length} sports:`, sportsData.map(s => s.name || s).join(', '));
    }
  } catch (error) {
    console.log('⚠️ Could not fetch sports list, using default sports');
    sportsData = [
      { name: 'football', displayName: 'Football' },
      { name: 'basketball', displayName: 'Basketball' },
      { name: 'tennis', displayName: 'Tennis' },
      { name: 'ufc', displayName: 'UFC' },
      { name: 'rugby', displayName: 'Rugby' },
      { name: 'baseball', displayName: 'Baseball' },
      { name: 'american-football', displayName: 'American Football' },
      { name: 'cricket', displayName: 'Cricket' },
      { name: 'motor-sports', displayName: 'Motor Sports' },
      { name: 'hockey', displayName: 'Hockey' }
    ];
  }
}

// Template rendering function
async function renderTemplate(templateName, data) {
  try {
    const templatePath = path.join(__dirname, 'views', `${templateName}.html`);
    const templateContent = await require('fs').promises.readFile(templatePath, 'utf8');
    const template = handlebars.compile(templateContent);
    return template(data);
  } catch (error) {
    console.error(`Error rendering template ${templateName}:`, error);
    throw error;
  }
}

// Homepage route - API only with advanced SEO
app.get('/', async (req, res) => {
  try {
    // Track clean visit (no AdBlock)
    trackAdblockVisit(false);
    
    const html = await renderTemplate('homepage', {
      sports: sportsData.map(s => s.name || s),
      timestamp: Date.now(),
      seo: {
        title: `${seoConfig.siteName} - Live Sports Streaming | Football, Basketball, Tennis, UFC, American Football, Hockey`,
        description: seoConfig.siteDescription,
        keywords: 'live sports streaming, football live stream, basketball streaming, tennis live, UFC fights, rugby streaming, baseball live, NFL live stream, American football streaming, hockey live stream',
        canonical: seoConfig.siteUrl,
        ogTitle: `${seoConfig.siteName} - Live Sports Streaming`,
        ogDescription: seoConfig.siteDescription,
        ogImage: seoConfig.defaultImage,
        twitterCard: 'summary_large_image',
        twitterTitle: `${seoConfig.siteName} - Live Sports Streaming`,
        twitterDescription: seoConfig.siteDescription,
        twitterImage: seoConfig.defaultImage
      }
    });
    
    res.send(html);
  } catch (error) {
    console.error('Error rendering homepage:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Sport-specific routes with advanced SEO
Object.keys(seoConfig.sports).forEach(sport => {
  const sportConfig = seoConfig.sports[sport];
  
  app.get(`/${sport}`, async (req, res) => {
    try {
      console.log(`🔄 Rendering ${sport} page...`);
      console.log(`📊 Sport config:`, sportConfig);
      
      const templateData = {
        sport: sportConfig,
        seo: {
          title: `${sportConfig.name} Live Streams | ${seoConfig.siteName} - Free ${sportConfig.name} Streaming`,
          description: sportConfig.description,
          keywords: sportConfig.keywords,
          canonical: `${seoConfig.siteUrl}/${sport}`,
          ogTitle: `${sportConfig.name} Live Streams | ${seoConfig.siteName}`,
          ogDescription: sportConfig.description,
          ogImage: sportConfig.image,
          twitterCard: 'summary_large_image',
          twitterTitle: `${sportConfig.name} Live Streams | ${seoConfig.siteName}`,
          twitterDescription: sportConfig.description,
          twitterImage: sportConfig.image
        }
      };
      
      console.log(`📝 Template data prepared for ${sport}`);
      const html = await renderTemplate(`${sport}`, templateData);
      console.log(`✅ Successfully rendered ${sport} page`);
      res.send(html);
    } catch (error) {
      console.error(`❌ Error rendering ${sport} page:`, error);
      console.error(`❌ Error details:`, error.message);
      console.error(`❌ Error stack:`, error.stack);
      res.status(500).send(`Internal Server Error: ${error.message}`);
    }
  });
});

// Match page route - fetch real data from Streamed.pk
app.get('/match/:slug', async (req, res) => {
  try {
    // Track clean visit (no AdBlock)
    trackAdblockVisit(false);
    
    const { slug } = req.params;
    
    // Try to find the match by searching through all sports
    let matchData = null;
    const sports = ['football', 'basketball', 'tennis', 'ufc', 'rugby', 'baseball', 'american-football', 'cricket', 'motor-sports', 'hockey'];
    
    console.log(`🔍 Searching for match with slug: ${slug}`);
    console.log(`🔍 Searching in sports: ${sports.join(', ')}`);
    
    for (const sport of sports) {
      try {
        const response = await axios.get(`${STREAMED_API_BASE}/matches/${sport}`, {
          timeout: 10000
        });
        
        let matches = [];
        if (Array.isArray(response.data)) {
          matches = response.data;
        } else if (response.data.value && Array.isArray(response.data.value)) {
          matches = response.data.value;
        }
        
        console.log(`🔍 ${sport}: found ${matches.length} matches`);
        
        // Filter american-football matches to exclude rugby/AFL matches
        if (sport === 'american-football') {
          matches = matches.filter(match => {
            const title = match.title ? match.title.toLowerCase() : '';
            const id = match.id ? match.id.toLowerCase() : '';
            
            // Exclude rugby matches (comprehensive list)
            const rugbyKeywords = [
              'rugby', 'npc:', 'super rugby', 'women\'s rugby', 'rugby world cup',
              'taranaki', 'hawkes bay', 'hawke\'s bay', 'counties manukau', 'auckland',
              'wellington', 'southland', 'canterbury', 'otago', 'tasman', 'waikato',
              'north harbour', 'northland', 'manawatu', 'bay of plenty', 'force', 'brumbies',
              'waratahs', 'reds', 'new zealand w', 'canada w'
            ];
            if (rugbyKeywords.some(keyword => title.includes(keyword) || id.includes(keyword))) {
              return false;
            }
            
            // Exclude AFL (Australian Football League) matches
            const aflKeywords = [
              'afl', 'australian football', 'hawthorn', 'geelong cats', 'collingwood',
              'essendon', 'fremantle', 'brisbane lions', 'port adelaide', 'magpies',
              'bombers', 'dockers', 'power', 'premiership football', 'afl womens'
            ];
            if (aflKeywords.some(keyword => title.includes(keyword) || id.includes(keyword))) {
              return false;
            }
            
            // Keep NFL, college football, and American football networks
            return true;
          });
        }
        
        // Filter rugby matches to exclude NFL matches incorrectly categorized as rugby
        if (sport === 'rugby') {
          matches = matches.filter(match => {
            const title = match.title ? match.title.toLowerCase() : '';
            const id = match.id ? match.id.toLowerCase() : '';
            
            // Exclude NFL/American football matches
            const nflKeywords = ['nfl:', 'nfl ', 'miami dolphins', 'buffalo bills', 'houston texans', 'jacksonville jaguars', 'pittsburgh steelers', 'new england patriots', 'dallas cowboys', 'chicago bears', 'green bay packers', 'cleveland browns', 'denver broncos', 'los angeles chargers', 'arizona cardinals', 'san francisco 49ers', 'kansas city chiefs', 'new york giants', 'detroit lions', 'baltimore ravens'];
            if (nflKeywords.some(keyword => title.includes(keyword) || id.includes(keyword))) {
              return false;
            }
            
            // Exclude AFL (Australian Football League) matches
            const aflKeywords = [
              'afl', 'australian football', 'hawthorn', 'geelong cats', 'collingwood',
              'essendon', 'fremantle', 'brisbane lions', 'port adelaide', 'magpies',
              'bombers', 'dockers', 'power', 'premiership football', 'afl womens'
            ];
            if (aflKeywords.some(keyword => title.includes(keyword) || id.includes(keyword))) {
              return false;
            }
            
            // Keep actual rugby matches (NRL, NPC, Super Rugby, etc.)
            return true;
          });
        }
        
        // Look for a match that matches our slug (try ID first, then title-based slug)
        const foundMatch = matches.find(match => {
          // Try direct ID match first
          if (match.id === slug) {
            console.log(`✅ Direct ID match found: ${match.id}`);
            return true;
          }
          
          // For motor sports and NFL channel matches, use the Streamed.pk ID as the slug directly
          if ((sport === 'motor-sports' || sport === 'american-football') && match.id && !match.title.includes(' vs ')) {
            console.log(`🔍 Checking ${sport} channel match "${match.title}": matchId="${match.id}" vs requestedSlug="${slug}"`);
            if (match.id === slug) {
              console.log(`✅ ${sport} channel match found by ID: ${match.id}`);
              return true;
            }
            // Don't fall through to regular slug matching for channel matches
            return false;
          }
          
          // For other sports, use slug-based matching
          let homeTeam = 'Team A';
          let awayTeam = 'Team B';
          
          if (match.teams && match.teams.home && match.teams.away) {
            homeTeam = match.teams.home.name || 'Team A';
            awayTeam = match.teams.away.name || 'Team B';
          } else if (match.title) {
            if (match.title.includes(' vs ')) {
              const titleParts = match.title.split(' vs ');
              if (titleParts.length === 2) {
                homeTeam = titleParts[0].trim();
                awayTeam = titleParts[1].trim();
              }
            } else {
              homeTeam = match.title;
              awayTeam = 'Live';
            }
          }
          
          // Handle date for slug generation
          let dateStr;
          if (match.date && match.date > 0) {
            dateStr = new Date(match.date).toISOString().split('T')[0];
          } else {
            dateStr = new Date().toISOString().split('T')[0];
          }
          
          const expectedSlug = `${homeTeam}-vs-${awayTeam}-live-${dateStr}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
          console.log(`🔍 Checking match "${match.title}": expectedSlug="${expectedSlug}" vs requestedSlug="${slug}"`);
          if (expectedSlug === slug) {
            console.log(`✅ Regular match found by slug: ${expectedSlug}`);
            return true;
          }
          return false;
        });
        
        if (foundMatch) {
          console.log(`✅ Found match: ${foundMatch.title} (${foundMatch.id})`);
          console.log(`📊 Match sources:`, foundMatch.sources ? `${foundMatch.sources.length} sources` : 'No sources');
          console.log(`📊 Match data structure:`, Object.keys(foundMatch));
          
          // Process the match data
          let homeTeam = 'Team A';
          let awayTeam = 'Team B';
          let teamABadge = '';
          let teamBBadge = '';
          
          if (foundMatch.teams && foundMatch.teams.home && foundMatch.teams.away) {
            homeTeam = foundMatch.teams.home.name || 'Team A';
            awayTeam = foundMatch.teams.away.name || 'Team B';
            teamABadge = foundMatch.teams.home.badge ? `https://streamed.pk/api/images/badge/${foundMatch.teams.home.badge}.webp` : '';
            teamBBadge = foundMatch.teams.away.badge ? `https://streamed.pk/api/images/badge/${foundMatch.teams.away.badge}.webp` : '';
          } else if (foundMatch.title) {
            if (foundMatch.title.includes(' vs ')) {
              const titleParts = foundMatch.title.split(' vs ');
              if (titleParts.length === 2) {
                homeTeam = titleParts[0].trim();
                awayTeam = titleParts[1].trim();
              }
            } else {
              // For motor sports, use the full title as home team
              homeTeam = foundMatch.title;
              awayTeam = 'Live';
            }
          }

          // Fetch detailed stream data for motor sports using Streamed.pk API structure
          let detailedStreams = [];
          if (foundMatch.sources && foundMatch.sources.length > 0) {
            try {
              console.log(`🔄 Fetching detailed streams for motor sports match: ${foundMatch.id}`);
              
              // Fetch initial stream list (like in streamed.html)
              const streamListResponse = await axios.get(`${STREAMED_API_BASE}/stream/embed/${foundMatch.id}`, {
                timeout: 10000
              });
              
              if (streamListResponse.data && Array.isArray(streamListResponse.data)) {
                // Fetch individual stream details for each source
                const streamDetails = await Promise.all(
                  streamListResponse.data.map(async (streamRef) => {
                    try {
                      const streamDetailResponse = await axios.get(`${STREAMED_API_BASE}/stream/${streamRef.source}/${streamRef.id}`, {
                        timeout: 10000
                      });
                      return streamDetailResponse.data;
                    } catch (error) {
                      console.log(`⚠️ Could not fetch stream details for ${streamRef.source}/${streamRef.id}:`, error.message);
                      return null;
                    }
                  })
                );
                
                // Filter out null results and flatten
                detailedStreams = streamDetails.filter(stream => stream !== null).flat();
                
                // Sort by viewers (highest first)
                detailedStreams.sort((a, b) => (b.viewers || 0) - (a.viewers || 0));
                
                console.log(`✅ Found ${detailedStreams.length} detailed streams for motor sports match`);
              }
            } catch (error) {
              console.log(`⚠️ Could not fetch detailed streams for motor sports match:`, error.message);
              // Fallback to original sources
              detailedStreams = foundMatch.sources || [];
            }
          } else {
            detailedStreams = foundMatch.sources || [];
          }
          
          // Handle date
          let matchDate;
          if (foundMatch.date && foundMatch.date > 0) {
            matchDate = new Date(foundMatch.date).toISOString();
          } else {
            const now = new Date();
            now.setHours(now.getHours() + 2);
            matchDate = now.toISOString();
          }
          
          matchData = {
            id: foundMatch.id,
            teamA: homeTeam,
            teamB: awayTeam,
            competition: foundMatch.title || `${sport.charAt(0).toUpperCase() + sport.slice(1)} Match`,
            date: matchDate,
            slug: slug,
            teamABadge: teamABadge,
            teamBBadge: teamBBadge,
            status: (() => {
              if (foundMatch.title.includes(' vs ')) {
                // Team vs team matches - use date-based status
                return foundMatch.date && foundMatch.date > 0 ? 'upcoming' : 'live';
              } else {
                // Check if it's a known channel/network (always live)
                const channelKeywords = ['snf:', 'tnf:', 'mnf:', 'nfl network', 'espn', 'fox sports', 'cbs sports', 'nbc sports', 'abc sports'];
                const isChannel = channelKeywords.some(keyword => foundMatch.title.toLowerCase().includes(keyword));
                return isChannel ? 'live' : (foundMatch.date && foundMatch.date > 0 ? 'upcoming' : 'live');
              }
            })(),
            poster: foundMatch.poster ? `https://streamed.pk/api/images/poster/${foundMatch.poster}` : '',
            popular: foundMatch.popular || false,
            sources: detailedStreams,
            category: foundMatch.category || sport,
            sport: sport
          };
          
          break;
        }
      } catch (error) {
        console.log(`⚠️ Could not search ${sport} matches:`, error.message);
      }
    }
    
    // JSON storage fallback: search admin matches by slug
    if (!matchData) {
      try {
        const { getMatchBySlug } = require('./lib/json-storage');
        const matchRow = getMatchBySlug(slug);
        if (matchRow) {
          console.log(`✅ Found admin match in JSON storage: ${matchRow.teamA} vs ${matchRow.teamB}`);
          matchData = {
            id: matchRow.id,
            teamA: matchRow.teamA,
            teamB: matchRow.teamB,
            competition: matchRow.competition,
            date: new Date(matchRow.date).toISOString(),
            slug: matchRow.slug || slug,
            teamABadge: matchRow.teamABadge || '',
            teamBBadge: matchRow.teamBBadge || '',
            status: matchRow.status || 'upcoming',
            poster: '',
            popular: false,
            sources: [],
            category: matchRow.sport || 'football',
            sport: matchRow.sport || 'football',
            embedUrls: Array.isArray(matchRow.embedUrls) ? matchRow.embedUrls : []
          };
        }
      } catch (e) {
        console.log('⚠️ JSON storage admin matches fallback failed:', e.message);
      }
    }

    if (!matchData) {
      console.log(`❌ No match found for slug: ${slug}`);
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Match Not Found</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>Match Not Found</h1>
          <p>The match you're looking for doesn't exist or has expired.</p>
          <a href="/" style="color: #ffcc00;">← Back to Home</a>
        </body>
        </html>
      `);
    }
    
    console.log(`📊 Rendering match page for: ${matchData.teamA} vs ${matchData.teamB}`);

    // Apply server overrides if exist from Supabase
    try {
      const { getSupabaseClient } = require('./lib/supabase');
      const supabase = getSupabaseClient();
      const { data: override } = await supabase.from('overrides').select('embed_urls').eq('slug', slug).single();
      if (override && Array.isArray(override.embed_urls) && override.embed_urls.length > 0) {
        matchData.embedUrls = override.embed_urls;
        console.log(`✅ Applied ${override.embed_urls.length} override server(s) for slug ${slug}`);
      }
    } catch (e) {
      console.log('Overrides lookup failed:', e.message);
    }
    
    const html = await renderTemplate('match', {
      match: matchData
    });
    
    res.send(html);
  } catch (error) {
    console.error('Error rendering match page:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Sport page routes
app.get('/football', async (req, res) => {
  try {
    // Track clean visit (no AdBlock)
    trackAdblockVisit(false);
    
    const html = await renderTemplate('football', {});
    res.send(html);
  } catch (error) {
    console.error('Error rendering football page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/basketball', async (req, res) => {
  try {
    // Track clean visit (no AdBlock)
    trackAdblockVisit(false);
    
    const html = await renderTemplate('basketball', {});
    res.send(html);
  } catch (error) {
    console.error('Error rendering basketball page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/tennis', async (req, res) => {
  try {
    // Track clean visit (no AdBlock)
    trackAdblockVisit(false);
    
    const html = await renderTemplate('tennis', {});
    res.send(html);
  } catch (error) {
    console.error('Error rendering tennis page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/ufc', async (req, res) => {
  try {
    // Track clean visit (no AdBlock)
    trackAdblockVisit(false);
    
    const html = await renderTemplate('ufc', {});
    res.send(html);
  } catch (error) {
    console.error('Error rendering UFC page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/rugby', async (req, res) => {
  try {
    // Track clean visit (no AdBlock)
    trackAdblockVisit(false);
    
    const sport = seoConfig.sports.rugby;
    const html = await renderTemplate('rugby', {
      sport: sport,
      seo: {
        title: `${sport.name} Live Streaming - ${seoConfig.siteName}`,
        description: sport.description,
        keywords: sport.keywords,
        canonical: `${seoConfig.siteUrl}/rugby`,
        ogTitle: `${sport.name} Live Streaming - ${seoConfig.siteName}`,
        ogDescription: sport.description,
        ogImage: sport.image,
        twitterCard: 'summary_large_image',
        twitterTitle: `${sport.name} Live Streaming - ${seoConfig.siteName}`,
        twitterDescription: sport.description,
        twitterImage: sport.image
      }
    });
    res.send(html);
  } catch (error) {
    console.error('Error rendering rugby page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/baseball', async (req, res) => {
  try {
    // Track clean visit (no AdBlock)
    trackAdblockVisit(false);
    
    const html = await renderTemplate('baseball', {});
    res.send(html);
  } catch (error) {
    console.error('Error rendering baseball page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/american-football', async (req, res) => {
  try {
    // Track clean visit (no AdBlock)
    trackAdblockVisit(false);
    
    const sport = seoConfig.sports['american-football'];
    const html = await renderTemplate('americanfootball', {
      sport: sport,
      seo: {
        title: `${sport.name} Live Streaming - ${seoConfig.siteName}`,
        description: sport.description,
        keywords: sport.keywords,
        canonical: `${seoConfig.siteUrl}/american-football`,
        ogTitle: `${sport.name} Live Streaming - ${seoConfig.siteName}`,
        ogDescription: sport.description,
        ogImage: sport.image,
        twitterCard: 'summary_large_image',
        twitterTitle: `${sport.name} Live Streaming - ${seoConfig.siteName}`,
        twitterDescription: sport.description,
        twitterImage: sport.image
      }
    });
    res.send(html);
  } catch (error) {
    console.error('Error rendering american-football page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/hockey', async (req, res) => {
  try {
    // Track clean visit (no AdBlock)
    trackAdblockVisit(false);
    
    const sport = seoConfig.sports.hockey;
    const html = await renderTemplate('hockey', {
      sport: sport,
      seo: {
        title: `${sport.name} Live Streaming - ${seoConfig.siteName}`,
        description: sport.description,
        keywords: sport.keywords,
        canonical: `${seoConfig.siteUrl}/hockey`,
        ogTitle: `${sport.name} Live Streaming - ${seoConfig.siteName}`,
        ogDescription: sport.description,
        ogImage: sport.image,
        twitterCard: 'summary_large_image',
        twitterTitle: `${sport.name} Live Streaming - ${seoConfig.siteName}`,
        twitterDescription: sport.description,
        twitterImage: sport.image
      }
    });
    res.send(html);
  } catch (error) {
    console.error('Error rendering hockey page:', error);
    res.status(500).send('Internal Server Error');
  }
});

// AdBlock version routes - ad-heavy versions for AdBlock users
app.get('/homepageadblock', async (req, res) => {
  try {
    // Track AdBlock visit
    trackAdblockVisit(true);
    
    const html = await renderTemplate('homepageadblock', {
      sports: sportsData.map(s => s.name || s),
      timestamp: Date.now(),
      seo: {
        title: `${seoConfig.siteName} - Live Sports Streaming | Football, Basketball, Tennis, UFC - AdBlock Version`,
        description: `${seoConfig.siteName} - Live sports streaming platform for football, basketball, tennis, UFC, rugby and baseball - AdBlock version with ads everywhere`,
        keywords: 'live sports streaming, football, basketball, tennis, ufc, rugby, baseball, adblock version',
        canonical: `${seoConfig.baseUrl}/homepageadblock`,
        ogTitle: `${seoConfig.siteName} - Live Sports Streaming - AdBlock Version`,
        ogDescription: 'Live sports streaming platform - AdBlock version with ads everywhere',
        ogImage: `${seoConfig.baseUrl}/images/og-image.jpg`,
        twitterCard: 'summary_large_image',
        twitterTitle: `${seoConfig.siteName} - Live Sports Streaming - AdBlock Version`,
        twitterDescription: 'Live sports streaming platform - AdBlock version with ads everywhere',
        twitterImage: `${seoConfig.baseUrl}/images/og-image.jpg`
      }
    });
    res.send(html);
  } catch (error) {
    console.error('Error rendering homepageadblock:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/footballadblock', async (req, res) => {
  try {
    // Track AdBlock visit
    trackAdblockVisit(true);
    
    const html = await renderTemplate('footballadblock', {});
    res.send(html);
  } catch (error) {
    console.error('Error rendering footballadblock page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/basketballadblock', async (req, res) => {
  try {
    // Track AdBlock visit
    trackAdblockVisit(true);
    
    const html = await renderTemplate('basketballadblock', {});
    res.send(html);
  } catch (error) {
    console.error('Error rendering basketballadblock page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/tennisadblock', async (req, res) => {
  try {
    // Track AdBlock visit
    trackAdblockVisit(true);
    
    const html = await renderTemplate('tennisadblock', {});
    res.send(html);
  } catch (error) {
    console.error('Error rendering tennisadblock page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/ufcadblock', async (req, res) => {
  try {
    // Track AdBlock visit
    trackAdblockVisit(true);
    
    const html = await renderTemplate('ufcadblock', {});
    res.send(html);
  } catch (error) {
    console.error('Error rendering ufcadblock page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/rugbyadblock', async (req, res) => {
  try {
    // Track AdBlock visit
    trackAdblockVisit(true);
    
    const html = await renderTemplate('rugbyadblock', {});
    res.send(html);
  } catch (error) {
    console.error('Error rendering rugbyadblock page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/baseballadblock', async (req, res) => {
  try {
    // Track AdBlock visit
    trackAdblockVisit(true);
    
    const html = await renderTemplate('baseballadblock', {});
    res.send(html);
  } catch (error) {
    console.error('Error rendering baseballadblock page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/american-footballadblock', async (req, res) => {
  try {
    // Track AdBlock visit
    trackAdblockVisit(true);
    
    const sport = seoConfig.sports['american-football'];
    const html = await renderTemplate('americanfootballadblock', {
      sport: sport,
      seo: {
        title: `${sport.name} Live Streaming - ${seoConfig.siteName} (AdBlock Version)`,
        description: sport.description + ' - AdBlock version with ads everywhere',
        keywords: sport.keywords + ', adblock version, ads everywhere',
        canonical: `${seoConfig.siteUrl}/american-footballadblock`,
        ogTitle: `${sport.name} Live Streaming - ${seoConfig.siteName} (AdBlock Version)`,
        ogDescription: sport.description + ' - AdBlock version with ads everywhere',
        ogImage: sport.image,
        twitterCard: 'summary_large_image',
        twitterTitle: `${sport.name} Live Streaming - ${seoConfig.siteName} (AdBlock Version)`,
        twitterDescription: sport.description + ' - AdBlock version with ads everywhere',
        twitterImage: sport.image
      }
    });
    res.send(html);
  } catch (error) {
    console.error('Error rendering american-footballadblock page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/cricketadblock', async (req, res) => {
  try {
    // Track AdBlock visit
    trackAdblockVisit(true);
    
    const sport = seoConfig.sports['cricket'];
    const html = await renderTemplate('cricketadblock', {
      sport: sport,
      seo: {
        title: `${sport.name} Live Streaming - ${seoConfig.siteName} (AdBlock Version)`,
        description: sport.description + ' - AdBlock version with ads everywhere',
        keywords: sport.keywords + ', adblock version',
        canonical: `${seoConfig.siteUrl}/cricketadblock`,
        ogTitle: `${sport.name} Live Streaming - ${seoConfig.siteName} (AdBlock Version)`,
        ogDescription: sport.description + ' - AdBlock version with ads everywhere',
        ogImage: sport.image,
        twitterCard: 'summary_large_image',
        twitterTitle: `${sport.name} Live Streaming - ${seoConfig.siteName} (AdBlock Version)`,
        twitterDescription: sport.description + ' - AdBlock version with ads everywhere',
        twitterImage: sport.image
      }
    });
    res.send(html);
  } catch (error) {
    console.error('Error rendering cricketadblock page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/motorsportsadblock', async (req, res) => {
  try {
    // Track AdBlock visit
    trackAdblockVisit(true);
    
    const sport = seoConfig.sports['motor-sports'];
    const html = await renderTemplate('motor-sportsadblock', {
      sport: sport,
      seo: {
        title: `${sport.name} Live Streaming - ${seoConfig.siteName} (AdBlock Version)`,
        description: sport.description + ' - AdBlock version with ads everywhere',
        keywords: sport.keywords + ', adblock version',
        canonical: `${seoConfig.siteUrl}/motorsportsadblock`,
        ogTitle: `${sport.name} Live Streaming - ${seoConfig.siteName} (AdBlock Version)`,
        ogDescription: sport.description + ' - AdBlock version with ads everywhere',
        ogImage: sport.image,
        twitterCard: 'summary_large_image',
        twitterTitle: `${sport.name} Live Streaming - ${seoConfig.siteName} (AdBlock Version)`,
        twitterDescription: sport.description + ' - AdBlock version with ads everywhere',
        twitterImage: sport.image
      }
    });
    res.send(html);
  } catch (error) {
    console.error('Error rendering motorsportsadblock page:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/hockeyadblock', async (req, res) => {
  try {
    // Track AdBlock visit
    trackAdblockVisit(true);
    
    const sport = seoConfig.sports.hockey;
    const html = await renderTemplate('hockeyadblock', {
      sport: sport,
      seo: {
        title: `${sport.name} Live Streaming - ${seoConfig.siteName} (AdBlock Version)`,
        description: sport.description + ' - AdBlock version with ads everywhere',
        keywords: sport.keywords + ', adblock version',
        canonical: `${seoConfig.siteUrl}/hockeyadblock`,
        ogTitle: `${sport.name} Live Streaming - ${seoConfig.siteName} (AdBlock Version)`,
        ogDescription: sport.description + ' - AdBlock version with ads everywhere',
        ogImage: sport.image,
        twitterCard: 'summary_large_image',
        twitterTitle: `${sport.name} Live Streaming - ${seoConfig.siteName} (AdBlock Version)`,
        twitterDescription: sport.description + ' - AdBlock version with ads everywhere',
        twitterImage: sport.image
      }
    });
    res.send(html);
  } catch (error) {
    console.error('Error rendering hockeyadblock page:', error);
    res.status(500).send('Internal Server Error');
  }
});

// AdBlock match page route
app.get('/matchadblock/:slug', async (req, res) => {
  try {
    // Track AdBlock visit
    trackAdblockVisit(true);
    
    const { slug } = req.params;
    console.log(`🔍 Loading AdBlock match page for slug: ${slug}`);
    
    // Try to find the match by searching through all sports
    let matchData = null;
    const sports = ['football', 'basketball', 'tennis', 'ufc', 'rugby', 'baseball', 'american-football', 'cricket', 'motor-sports', 'hockey'];
    
    for (const sport of sports) {
      try {
        const response = await axios.get(`${STREAMED_API_BASE}/matches/${sport}`, {
          timeout: 10000
        });
        
        let matches = [];
        if (Array.isArray(response.data)) {
          matches = response.data;
        } else if (response.data.value && Array.isArray(response.data.value)) {
          matches = response.data.value;
        }
        
        console.log(`🔍 ${sport}: found ${matches.length} matches`);
        
        // Filter american-football matches to exclude rugby/AFL matches
        if (sport === 'american-football') {
          matches = matches.filter(match => {
            const title = match.title ? match.title.toLowerCase() : '';
            const id = match.id ? match.id.toLowerCase() : '';
            
            // Exclude rugby matches (comprehensive list)
            const rugbyKeywords = [
              'rugby', 'npc:', 'super rugby', 'women\'s rugby', 'rugby world cup',
              'taranaki', 'hawkes bay', 'hawke\'s bay', 'counties manukau', 'auckland',
              'wellington', 'southland', 'canterbury', 'otago', 'tasman', 'waikato',
              'north harbour', 'northland', 'manawatu', 'bay of plenty', 'force', 'brumbies',
              'waratahs', 'reds', 'new zealand w', 'canada w'
            ];
            if (rugbyKeywords.some(keyword => title.includes(keyword) || id.includes(keyword))) {
              return false;
            }
            
            // Exclude AFL (Australian Football League) matches
            const aflKeywords = [
              'afl', 'australian football', 'hawthorn', 'geelong cats', 'collingwood',
              'essendon', 'fremantle', 'brisbane lions', 'port adelaide', 'magpies',
              'bombers', 'dockers', 'power', 'premiership football', 'afl womens'
            ];
            if (aflKeywords.some(keyword => title.includes(keyword) || id.includes(keyword))) {
              return false;
            }
            
            // Keep NFL, college football, and American football networks
            return true;
          });
        }
        
        // Filter rugby matches to exclude NFL matches incorrectly categorized as rugby
        if (sport === 'rugby') {
          matches = matches.filter(match => {
            const title = match.title ? match.title.toLowerCase() : '';
            const id = match.id ? match.id.toLowerCase() : '';
            
            // Exclude NFL/American football matches
            const nflKeywords = ['nfl:', 'nfl ', 'miami dolphins', 'buffalo bills', 'houston texans', 'jacksonville jaguars', 'pittsburgh steelers', 'new england patriots', 'dallas cowboys', 'chicago bears', 'green bay packers', 'cleveland browns', 'denver broncos', 'los angeles chargers', 'arizona cardinals', 'san francisco 49ers', 'kansas city chiefs', 'new york giants', 'detroit lions', 'baltimore ravens'];
            if (nflKeywords.some(keyword => title.includes(keyword) || id.includes(keyword))) {
              return false;
            }
            
            // Exclude AFL (Australian Football League) matches
            const aflKeywords = [
              'afl', 'australian football', 'hawthorn', 'geelong cats', 'collingwood',
              'essendon', 'fremantle', 'brisbane lions', 'port adelaide', 'magpies',
              'bombers', 'dockers', 'power', 'premiership football', 'afl womens'
            ];
            if (aflKeywords.some(keyword => title.includes(keyword) || id.includes(keyword))) {
              return false;
            }
            
            // Keep actual rugby matches (NRL, NPC, Super Rugby, etc.)
            return true;
          });
        }
        
        // Look for a match that matches our slug (try ID first, then title-based slug)
        const foundMatch = matches.find(match => {
          // Try direct ID match first
          if (match.id === slug) {
            console.log(`✅ AdBlock: Direct ID match found: ${match.id}`);
            return true;
          }
          
          // For motor sports and NFL channel matches, use the Streamed.pk ID as the slug directly
          if ((sport === 'motor-sports' || sport === 'american-football') && match.id && !match.title.includes(' vs ')) {
            console.log(`🔍 AdBlock: Checking ${sport} channel match "${match.title}": matchId="${match.id}" vs requestedSlug="${slug}"`);
            if (match.id === slug) {
              console.log(`✅ AdBlock: ${sport} channel match found by ID: ${match.id}`);
              return true;
            }
            // Don't fall through to regular slug matching for channel matches
            return false;
          }
          
          // For other sports, use slug-based matching
          let homeTeam = 'Team A';
          let awayTeam = 'Team B';
          
          if (match.teams && match.teams.home && match.teams.away) {
            homeTeam = match.teams.home.name || 'Team A';
            awayTeam = match.teams.away.name || 'Team B';
          } else if (match.title) {
            if (match.title.includes(' vs ')) {
              const titleParts = match.title.split(' vs ');
              if (titleParts.length === 2) {
                homeTeam = titleParts[0].trim();
                awayTeam = titleParts[1].trim();
              }
            } else {
              homeTeam = match.title;
              awayTeam = 'Live';
            }
          }
          
          // Handle date for slug generation
          let dateStr;
          if (match.date && match.date > 0) {
            dateStr = new Date(match.date).toISOString().split('T')[0];
          } else {
            dateStr = new Date().toISOString().split('T')[0];
          }
          
          const expectedSlug = `${homeTeam}-vs-${awayTeam}-live-${dateStr}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
          console.log(`🔍 AdBlock: Checking match "${match.title}": expectedSlug="${expectedSlug}" vs requestedSlug="${slug}"`);
          if (expectedSlug === slug) {
            console.log(`✅ AdBlock: Regular match found by slug: ${expectedSlug}`);
            return true;
          }
          return false;
        });
        
        if (foundMatch) {
          matchData = { ...foundMatch, sport };
          break;
        }
      } catch (error) {
        console.log(`No matches found for ${sport}`);
      }
    }
    
    // If not found in API, check admin-added matches
    if (!matchData) {
      try {
        const supabase = getSupabaseClient();
        const { data: adminMatches } = await supabase
          .from('matches')
          .select('*')
          .eq('slug', slug)
          .single();
        
        if (adminMatches) {
          matchData = adminMatches;
        }
      } catch (error) {
        console.log('No admin match found for slug:', slug);
      }
    }
    
    if (!matchData) {
      console.log(`❌ No match found for slug: ${slug}`);
      return res.status(404).send('Match not found');
    }
    
    console.log(`✅ Found match data:`, matchData);
    
    // Check for server overrides
    let embedUrls = matchData.embedUrls || [];
    try {
      const supabase = getSupabaseClient();
      const { data: overrides } = await supabase
        .from('overrides')
        .select('embedUrls')
        .eq('slug', slug)
        .single();
      
      if (overrides && overrides.embedUrls) {
        embedUrls = overrides.embedUrls;
        console.log(`✅ Using override embed URLs for ${slug}`);
      }
    } catch (error) {
      console.log('No overrides found for slug:', slug);
    }
    
    const html = await renderTemplate('matchadblock', {
      match: matchData,
      embedUrls: embedUrls,
      seo: {
        title: `${matchData.teamA} vs ${matchData.teamB} - Live Stream | ${seoConfig.siteName} - AdBlock Version`,
        description: `Watch ${matchData.teamA} vs ${matchData.teamB} live stream in HD quality. Free streaming with no registration required - AdBlock version`,
        keywords: `${matchData.teamA}, ${matchData.teamB}, live stream, ${matchData.sport}, adblock version`,
        canonical: `${seoConfig.baseUrl}/matchadblock/${slug}`,
        ogTitle: `${matchData.teamA} vs ${matchData.teamB} - Live Stream - AdBlock Version`,
        ogDescription: `Watch ${matchData.teamA} vs ${matchData.teamB} live stream - AdBlock version`,
        ogImage: `${seoConfig.baseUrl}/images/og-image.jpg`,
        twitterCard: 'summary_large_image',
        twitterTitle: `${matchData.teamA} vs ${matchData.teamB} - Live Stream - AdBlock Version`,
        twitterDescription: `Watch ${matchData.teamA} vs ${matchData.teamB} live stream - AdBlock version`,
        twitterImage: `${seoConfig.baseUrl}/images/og-image.jpg`
      }
    });
    
    res.send(html);
  } catch (error) {
    console.error('Error rendering AdBlock match page:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Streamed.pk API proxy endpoints
app.get('/api/streamed/sports', async (req, res) => {
  try {
    const response = await axios.get(`${STREAMED_API_BASE}/sports`, {
      timeout: 10000
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching sports:', error);
    res.status(500).json({ error: 'Failed to fetch sports' });
  }
});

app.get('/api/streamed/matches/:sport', async (req, res) => {
  try {
    const { sport } = req.params;
    const response = await axios.get(`${STREAMED_API_BASE}/matches/${sport}`, {
      timeout: 15000
    });
    
    let matches = response.data;
    
    // Apply filtering based on sport
    if (sport === 'american-football') {
      // Handle the API response structure
      if (Array.isArray(matches)) {
        // Direct array response
      } else if (matches.value && Array.isArray(matches.value)) {
        matches = matches.value;
      } else {
        matches = [];
      }
      
      // Filter american-football matches to exclude rugby/AFL matches
      matches = matches.filter(match => {
        const title = match.title ? match.title.toLowerCase() : '';
        const id = match.id ? match.id.toLowerCase() : '';
        
        // Exclude rugby matches (comprehensive list)
        const rugbyKeywords = [
          'rugby', 'npc:', 'super rugby', 'women\'s rugby', 'rugby world cup',
          'taranaki', 'hawkes bay', 'hawke\'s bay', 'counties manukau', 'auckland',
          'wellington', 'southland', 'canterbury', 'otago', 'tasman', 'waikato',
          'north harbour', 'northland', 'manawatu', 'bay of plenty', 'force', 'brumbies',
          'waratahs', 'reds', 'new zealand w', 'canada w'
        ];
        if (rugbyKeywords.some(keyword => title.includes(keyword) || id.includes(keyword))) {
          return false;
        }
        
        // Exclude AFL (Australian Football League) matches
        const aflKeywords = [
          'afl', 'australian football', 'hawthorn', 'geelong cats', 'collingwood',
          'essendon', 'fremantle', 'brisbane lions', 'port adelaide', 'magpies',
          'bombers', 'dockers', 'power', 'premiership football', 'afl womens'
        ];
        if (aflKeywords.some(keyword => title.includes(keyword) || id.includes(keyword))) {
          return false;
        }
        
        // Keep NFL, college football, and American football networks
        return true;
      });
    } else if (sport === 'rugby') {
      // Handle the API response structure
      if (Array.isArray(matches)) {
        // Direct array response
      } else if (matches.value && Array.isArray(matches.value)) {
        matches = matches.value;
      } else {
        matches = [];
      }
      
      // Filter rugby matches to exclude NFL matches incorrectly categorized as rugby
      matches = matches.filter(match => {
        const title = match.title ? match.title.toLowerCase() : '';
        const id = match.id ? match.id.toLowerCase() : '';
        
        // Exclude NFL/American football matches
        const nflKeywords = [
          'nfl:', 'nfl ', 'miami dolphins', 'buffalo bills', 'houston texans', 'jacksonville jaguars',
          'pittsburgh steelers', 'new england patriots', 'dallas cowboys', 'chicago bears',
          'green bay packers', 'cleveland browns', 'denver broncos', 'los angeles chargers',
          'arizona cardinals', 'san francisco 49ers', 'kansas city chiefs', 'new york giants',
          'detroit lions', 'baltimore ravens', 'atlanta falcons', 'carolina panthers',
          'new orleans saints', 'tampa bay buccaneers', 'washington commanders', 'philadelphia eagles',
          'new york jets', 'las vegas raiders', 'los angeles rams', 'seattle seahawks',
          'indianapolis colts', 'tennessee titans', 'cincinnati bengals', 'minnesota vikings'
        ];
        if (nflKeywords.some(keyword => title.includes(keyword) || id.includes(keyword))) {
          return false;
        }
        
        // Exclude AFL (Australian Football League) matches
        const aflKeywords = [
          'afl', 'australian football', 'hawthorn', 'geelong cats', 'collingwood',
          'essendon', 'fremantle', 'brisbane lions', 'port adelaide', 'magpies',
          'bombers', 'dockers', 'power', 'premiership football', 'afl womens'
        ];
        if (aflKeywords.some(keyword => title.includes(keyword) || id.includes(keyword))) {
          return false;
        }
        
        // Keep actual rugby matches (NRL, NPC, Super Rugby, etc.)
        return true;
      });
    }
    
    res.json(matches);
  } catch (error) {
    console.error(`Error fetching ${req.params.sport} matches:`, error);
    res.status(500).json({ error: `Failed to fetch ${req.params.sport} matches` });
  }
});

app.get('/api/streamed/matches/:sport/popular', async (req, res) => {
  try {
    const { sport } = req.params;
    const response = await axios.get(`${STREAMED_API_BASE}/matches/${sport}/popular`, {
      timeout: 15000
    });
    res.json(response.data);
  } catch (error) {
    console.error(`Error fetching popular ${sport} matches:`, error);
    res.status(500).json({ error: `Failed to fetch popular ${sport} matches` });
  }
});

app.get('/api/streamed/matches/all', async (req, res) => {
  try {
    const response = await axios.get(`${STREAMED_API_BASE}/matches/all`, {
      timeout: 15000
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching all matches:', error);
    res.status(500).json({ error: 'Failed to fetch all matches' });
  }
});

app.get('/api/streamed/matches/all/popular', async (req, res) => {
  try {
    const response = await axios.get(`${STREAMED_API_BASE}/matches/all/popular`, {
      timeout: 15000
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching popular matches:', error);
    res.status(500).json({ error: 'Failed to fetch popular matches' });
  }
});

app.get('/api/streamed/matches/all-today', async (req, res) => {
  try {
    const response = await axios.get(`${STREAMED_API_BASE}/matches/all-today`, {
      timeout: 15000
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching today\'s matches:', error);
    res.status(500).json({ error: 'Failed to fetch today\'s matches' });
  }
});

app.get('/api/streamed/matches/all-today/popular', async (req, res) => {
  try {
    const response = await axios.get(`${STREAMED_API_BASE}/matches/all-today/popular`, {
      timeout: 15000
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching popular today\'s matches:', error);
    res.status(500).json({ error: 'Failed to fetch popular today\'s matches' });
  }
});

app.get('/api/streamed/matches/live', async (req, res) => {
  try {
    const response = await axios.get(`${STREAMED_API_BASE}/matches/live`, {
      timeout: 15000
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching live matches:', error);
    res.status(500).json({ error: 'Failed to fetch live matches' });
  }
});

app.get('/api/streamed/matches/live/popular', async (req, res) => {
  try {
    const response = await axios.get(`${STREAMED_API_BASE}/matches/live/popular`, {
      timeout: 15000
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching popular live matches:', error);
    res.status(500).json({ error: 'Failed to fetch popular live matches' });
  }
});

app.get('/api/streamed/stream/:source/:id', async (req, res) => {
  try {
    const { source, id } = req.params;
    const response = await axios.get(`${STREAMED_API_BASE}/stream/${source}/${id}`, {
      timeout: 10000
    });
    res.json(response.data);
  } catch (error) {
    console.error(`Error fetching stream ${source}/${id}:`, error);
    res.status(500).json({ error: 'Failed to fetch stream' });
  }
});

app.get('/api/streamed/images/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    const response = await axios.get(`${STREAMED_API_BASE}/images/${type}/${id}`, {
      timeout: 10000,
      responseType: 'stream'
    });
    
    res.set({
      'Content-Type': response.headers['content-type'] || 'image/webp',
      'Cache-Control': 'public, max-age=3600'
    });
    
    response.data.pipe(res);
  } catch (error) {
    console.error(`Error fetching image ${type}/${id}:`, error);
    res.status(500).json({ error: 'Failed to fetch image' });
  }
});

// Live viewer counts (in-memory)
const viewerClientsBySlug = new Map(); // slug -> Set<res>

function getViewerCount(slug) {
  const set = viewerClientsBySlug.get(slug);
  return set ? set.size : 0;
}

function broadcastViewerCount(slug) {
  const set = viewerClientsBySlug.get(slug);
  if (!set) return;
  const payload = `data: ${JSON.stringify({ slug, count: getViewerCount(slug) })}\n\n`;
  for (const client of set) {
    try {
      client.write(payload);
    } catch (e) {
      // Ignore write errors
    }
  }
}

// SSE endpoint for a single match slug
app.get('/api/viewers/:slug/stream', (req, res) => {
  try {
    const { slug } = req.params;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Nginx
    res.setHeader('Transfer-Encoding', 'chunked');
    res.flushHeaders && res.flushHeaders();

    if (!viewerClientsBySlug.has(slug)) {
      viewerClientsBySlug.set(slug, new Set());
    }
    const clients = viewerClientsBySlug.get(slug);
    clients.add(res);

    // Send initial count immediately and a comment to open the stream
    res.write(': connected\n\n');
    res.write(`data: ${JSON.stringify({ slug, count: getViewerCount(slug) })}\n\n`);

    // Heartbeat to keep connection alive (and bypass proxies)
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch (e) {
        // noop
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(ping);
      const set = viewerClientsBySlug.get(slug);
      if (set) {
        set.delete(res);
        if (set.size === 0) {
          viewerClientsBySlug.delete(slug);
        } else {
          broadcastViewerCount(slug);
        }
      }
    });

    // Notify others of new viewer
    broadcastViewerCount(slug);
  } catch (error) {
    try { res.end(); } catch (e) {}
  }
});

// Basic GET: current viewer count for a slug
app.get('/api/viewers/:slug', (req, res) => {
  const { slug } = req.params;
  res.json({ slug, count: getViewerCount(slug) });
});

// Bulk GET: counts for many slugs (comma-separated)
app.get('/api/viewers/bulk', (req, res) => {
  const slugsParam = req.query.slugs || '';
  const slugs = slugsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 200);
  const stream = req.query.stream === 'true';
  
  if (stream) {
    // SSE streaming for real-time updates
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // Send initial data
    const counts = {};
    for (const slug of slugs) {
      counts[slug] = getViewerCount(slug);
    }
    res.write(`data: ${JSON.stringify({ counts })}\n\n`);
    
    // Set up periodic updates every 3 seconds
    const interval = setInterval(() => {
      const counts = {};
      for (const slug of slugs) {
        counts[slug] = getViewerCount(slug);
      }
      res.write(`data: ${JSON.stringify({ counts })}\n\n`);
    }, 3000);
    
    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(interval);
    });
    
    // Send heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);
    
    req.on('close', () => {
      clearInterval(heartbeat);
    });
    
  } else {
    // Regular JSON response
    const counts = {};
    for (const slug of slugs) {
      counts[slug] = getViewerCount(slug);
    }
    res.json({ counts });
  }
});

// Advanced Sitemap route with dynamic content
app.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = 'https://arenastreams.com';
    const currentDate = new Date().toISOString();
    
    // Get live matches for dynamic content
    let liveMatches = [];
    try {
      const response = await fetch('https://streamed.pk/api/matches/live');
      const data = await response.json();
      liveMatches = data.matches || [];
    } catch (error) {
      console.log('Could not fetch live matches for sitemap');
    }
    
    // Static pages
    const staticPages = [
      { url: '/', priority: '1.0', changefreq: 'hourly' },
      { url: '/football', priority: '0.9', changefreq: 'daily' },
      { url: '/basketball', priority: '0.9', changefreq: 'daily' },
      { url: '/tennis', priority: '0.9', changefreq: 'daily' },
      { url: '/ufc', priority: '0.9', changefreq: 'daily' },
      { url: '/rugby', priority: '0.9', changefreq: 'daily' },
      { url: '/baseball', priority: '0.9', changefreq: 'daily' },
      { url: '/american-football', priority: '0.9', changefreq: 'daily' },
      { url: '/privacy', priority: '0.3', changefreq: 'monthly' },
      { url: '/terms', priority: '0.3', changefreq: 'monthly' },
      { url: '/contact', priority: '0.4', changefreq: 'monthly' }
    ];
    
    // Generate URLs for live matches
    const matchUrls = liveMatches.map(match => {
      const slug = match.title ? match.title.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim() : `match-${match.id}`;
      
      return {
        url: `/match/${slug}-${match.id}`,
        priority: '0.8',
        changefreq: 'hourly',
        lastmod: match.date || currentDate
      };
    });
    
    // Combine all URLs
    const allUrls = [...staticPages, ...matchUrls];
    
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(page => `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${page.lastmod || currentDate}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
    
    res.set('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Additional sitemaps for 11/10 SEO
app.get('/sitemap-sports.xml', async (req, res) => {
  try {
    const sports = ['football', 'basketball', 'tennis', 'ufc', 'rugby', 'baseball', 'american-football', 'cricket', 'motor-sports', 'hockey'];
    const urls = sports.map(sport => ({
      loc: `https://arenastreams.com/${sport}`,
      lastmod: new Date().toISOString(),
      changefreq: 'daily',
      priority: '0.9'
    }));
    
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
    
    res.set('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    console.error('Error generating sports sitemap:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/sitemap-images.xml', async (req, res) => {
  try {
    const sports = [
      { sport: 'football', name: 'Football', image: 'https://arenastreams.com/images/football-og.jpg' },
      { sport: 'basketball', name: 'Basketball', image: 'https://arenastreams.com/images/basketball-og.jpg' },
      { sport: 'tennis', name: 'Tennis', image: 'https://arenastreams.com/images/tennis-og.jpg' },
      { sport: 'ufc', name: 'UFC', image: 'https://arenastreams.com/images/ufc-og.jpg' },
      { sport: 'rugby', name: 'Rugby', image: 'https://arenastreams.com/images/rugby-og.jpg' },
      { sport: 'baseball', name: 'Baseball', image: 'https://arenastreams.com/images/baseball-og.jpg' },
      { sport: 'american-football', name: 'American Football', image: 'https://arenastreams.com/images/american-football-og.jpg' }
    ];
    
    // Get live matches for dynamic image content
    let liveMatches = [];
    try {
      const response = await fetch('https://streamed.pk/api/matches/live');
      const data = await response.json();
      liveMatches = data.matches || [];
    } catch (error) {
      console.log('Could not fetch live matches for image sitemap');
    }
    
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <!-- Homepage images -->
  <url>
    <loc>https://arenastreams.com/</loc>
    <image:image>
      <image:loc>https://arenastreams.com/images/arenastreams-logo.png</image:loc>
      <image:caption>ArenaStreams - Live Sports Streaming Platform</image:caption>
      <image:title>ArenaStreams Logo</image:title>
    </image:image>
    <image:image>
      <image:loc>https://arenastreams.com/images/football-og.jpg</image:loc>
      <image:caption>Football Live Streaming on ArenaStreams</image:caption>
      <image:title>Football Live Streaming</image:title>
    </image:image>
  </url>
  
  <!-- Sport pages with relevant images -->
${sports.map(sport => `  <url>
    <loc>https://arenastreams.com/${sport.sport}</loc>
    <image:image>
      <image:loc>${sport.image}</image:loc>
      <image:caption>${sport.name} Live Streaming - Watch ${sport.name} matches live on ArenaStreams</image:caption>
      <image:title>${sport.name} Live Streaming</image:title>
    </image:image>
  </url>`).join('\n')}
  
  <!-- Live match images -->
${liveMatches.slice(0, 50).map(match => {
  const slug = match.title ? match.title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim() : `match-${match.id}`;
  
  return `  <url>
    <loc>https://arenastreams.com/match/${slug}-${match.id}</loc>
    ${match.teamABadge ? `<image:image>
      <image:loc>${match.teamABadge}</image:loc>
      <image:caption>${match.teamA} vs ${match.teamB} - Live Match</image:caption>
      <image:title>${match.teamA} Team Badge</image:title>
    </image:image>` : ''}
    ${match.teamBBadge ? `<image:image>
      <image:loc>${match.teamBBadge}</image:loc>
      <image:caption>${match.teamA} vs ${match.teamB} - Live Match</image:caption>
      <image:title>${match.teamB} Team Badge</image:title>
    </image:image>` : ''}
  </url>`;
}).join('\n')}
</urlset>`;
    
    res.set('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    console.error('Error generating image sitemap:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Sitemap Index route
app.get('/sitemap-index.xml', (req, res) => {
  const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://arenastreams.com/sitemap.xml</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://arenastreams.com/sitemap-sports.xml</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://arenastreams.com/sitemap-images.xml</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
  </sitemap>
</sitemapindex>`;
  
  res.set('Content-Type', 'application/xml');
  res.send(sitemapIndex);
});

// Advanced Robots.txt route
app.get('/robots.txt', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /add-match
Disallow: /update-match

# Crawl-delay for respectful crawling
Crawl-delay: 1

# Sitemap location - Main sitemap index
Sitemap: https://arenastreams.com/sitemap-index.xml

# Individual sitemaps for different content types
Sitemap: https://arenastreams.com/sitemap.xml
Sitemap: https://arenastreams.com/sitemap-sports.xml
Sitemap: https://arenastreams.com/sitemap-images.xml

# Host directive for canonical domain
Host: https://arenastreams.com`);
});

// Privacy Policy route
app.get('/privacy', async (req, res) => {
  try {
    const html = await renderTemplate('privacy', {});
    res.send(html);
  } catch (error) {
    console.error('Error rendering privacy page:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Terms of Service route
app.get('/terms', async (req, res) => {
  try {
    const html = await renderTemplate('terms', {});
    res.send(html);
  } catch (error) {
    console.error('Error rendering terms page:', error);
    res.status(500).send('Internal Server Error');
  }
});

// API endpoint for client to track AdBlock status
app.post('/api/track-adblock', (req, res) => {
  try {
    const { adblock, page, timestamp } = req.body;
    console.log(`📊 Client tracking AdBlock status: ${adblock ? 'ON' : 'OFF'} on page: ${page}`);
    
    // Track the visit
    trackAdblockVisit(adblock);
    
    res.json({ success: true, tracked: true });
  } catch (error) {
    console.error('Error tracking AdBlock status:', error);
    res.status(500).json({ error: 'Failed to track AdBlock status' });
  }
});

// API endpoint for admin to get AdBlock statistics
app.get('/api/admin/adblock-stats', (req, res) => {
  try {
    const stats = getAdblockStats();
    console.log('📊 AdBlock stats requested:', stats);
    res.json(stats);
  } catch (error) {
    console.error('Error getting AdBlock stats:', error);
    res.status(500).json({ error: 'Failed to get AdBlock statistics' });
  }
});

// Initialize data and start server
initializeData().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 ArenaStreams server running on port ${PORT}`);
    console.log(`📱 Homepage: http://localhost:${PORT}`);
    console.log(`⚽ Football: http://localhost:${PORT}/football`);
    console.log(`🏀 Basketball: http://localhost:${PORT}/basketball`);
    console.log(`🎾 Tennis: http://localhost:${PORT}/tennis`);
    console.log(`🥊 UFC: http://localhost:${PORT}/ufc`);
    console.log(`🏉 Rugby: http://localhost:${PORT}/rugby`);
    console.log(`⚾ Baseball: http://localhost:${PORT}/baseball`);
    console.log(`🔧 Admin: http://localhost:${PORT}/admin`);
    console.log(`📊 API: http://localhost:${PORT}/api/streamed/sports`);
  });
});