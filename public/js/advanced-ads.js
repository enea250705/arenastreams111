/* Simple ad handling - no AdBlock detection */
(function() {
  if (window.__advancedAdsInitialized) return; // prevent double-init
  window.__advancedAdsInitialized = true;

  function log() {
    try { console.log.apply(console, ['[ads]'].concat([].slice.call(arguments))); } catch(e) {}
  }

  function init() {
    log('Simple ad system initialized - no AdBlock detection');
    
    // Set body class to indicate no AdBlock detection
    document.body.classList.add('adblock-off');
    
    // Keep existing behavior - hide ads on non-match pages
        const isMatchPage = /^\/match\//.test(location.pathname);
        if (!isMatchPage) {
          try {
            // Hide common ad iframes by known providers
            const adIframeSelectors = [
              'iframe[src*="otieu.com"]',
              'iframe[src*="madurird.com"]',
              'iframe[src*="al5sm.com"]',
              'iframe[src*="kt.restowelected.com"]',
              'iframe[src*="np.mournersamoa.com"]',
              'iframe[src*="shoukigaigoors.net"]',
              'iframe[src*="tzegilo.com"]'
            ];
            document.querySelectorAll(adIframeSelectors.join(',')).forEach(el => {
              const container = el.closest('section, .bg-gray-800, .ad, .ad-slot, .ad-inline, .container, div');
              (container || el).style.display = 'none';
            });
            // Hide generic blocks labeled "Advertisement"
            document.querySelectorAll('p, span, div').forEach(el => {
              try {
                const txt = (el.textContent || '').trim().toLowerCase();
                if (txt === 'advertisement' || txt === 'advertisements') {
                  const container = el.closest('section, .bg-gray-800, .ad, .ad-slot, .ad-inline, .container, div');
                  (container || el).style.display = 'none';
                }
              } catch(e) {}
            });
          } catch (e) {}
        }
        
    log('Ad system initialized successfully');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


