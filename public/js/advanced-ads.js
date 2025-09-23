/* Advanced ad handling: detect adblock and adjust ad density.
   - If adblock is ON: inject dense house-ad placements (top sticky, bottom sticky, inline blocks)
   - If adblock is OFF: keep current experience (no extra injection here)
*/
(function() {
  if (window.__advancedAdsInitialized) return; // prevent double-init
  window.__advancedAdsInitialized = true;

  // Basic config
  const MAX_INLINE_ADS_DENSE = 12; // more ads for AdBlock ON users

  function log() {
    try { console.log.apply(console, ['[ads]'].concat([].slice.call(arguments))); } catch(e) {}
  }

  function createStyleOnce() {
    if (document.getElementById('advanced-ads-styles')) return;
    // House ad styles removed - no longer generating revenue
    const css = `
      /* Minimal styles for banner only */
    `;
    const style = document.createElement('style');
    style.id = 'advanced-ads-styles';
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  function detectAdblock(timeoutMs = 1500) {
    return new Promise((resolve) => {
      let done = false;
      let networkBlocked = false;
      let imageLoaded = false;
      let scriptBlocked = false;
      let baitBlocked = false;
      let multipleBaitBlocked = false;

      // Multiple bait element tests for better detection
      const baitElements = [];
      const baitClasses = [
        'ads ad adsbox sponsor advertisement ad-banner',
        'advertisement ads ad-banner',
        'adsbox ad-container',
        'sponsored-content ad'
      ];

      // Create multiple bait elements
      baitClasses.forEach((className, index) => {
        const bait = document.createElement('div');
        bait.className = className;
        bait.style.cssText = 'position:absolute; left:-9999px; width:1px; height:1px; visibility:hidden;';
        bait.id = `ad-bait-${index}`;
        document.body.appendChild(bait);
        baitElements.push(bait);
      });

      // Network probe to a common ad path we serve
      const img = new Image();
      img.onload = function() { 
        imageLoaded = true; 
        log('Ad probe image loaded successfully');
      };
      img.onerror = function() { 
        networkBlocked = true; 
        log('Ad probe image blocked');
      };
      img.src = '/ads/ad.gif?ts=' + Date.now();

      // Script probe test
      const script = document.createElement('script');
      script.onload = function() {
        log('Ad probe script loaded successfully');
      };
      script.onerror = function() {
        scriptBlocked = true;
        log('Ad probe script blocked');
      };
      script.src = '/ads/test.js?ts=' + Date.now();
      document.head.appendChild(script);

      // Additional detection methods
      let fetchBlocked = false;
      try {
        fetch('/ads/test.js?ts=' + Date.now(), { method: 'HEAD' })
          .then(() => log('Fetch probe successful'))
          .catch(() => {
            fetchBlocked = true;
            log('Fetch probe blocked');
          });
      } catch(e) {
        fetchBlocked = true;
        log('Fetch probe failed');
      }

      setTimeout(function() {
        if (done) return;
        done = true;
        
        // Check bait elements
        let blockedBaitCount = 0;
        baitElements.forEach((bait, index) => {
          try {
            const computedStyle = getComputedStyle(bait);
            const isHidden = computedStyle.display === 'none' || 
                           computedStyle.visibility === 'hidden' ||
                           bait.offsetParent === null || 
                           bait.offsetHeight === 0 ||
                           bait.offsetWidth === 0;
            
            if (isHidden) {
              blockedBaitCount++;
              log(`Bait element ${index} blocked`);
            }
            document.body.removeChild(bait);
          } catch(e) {
            log(`Error checking bait element ${index}:`, e);
          }
        });

        // Clean up script probe
        try { document.head.removeChild(script); } catch(e) {}
        
        // Calculate detection results
        baitBlocked = blockedBaitCount > 0;
        multipleBaitBlocked = blockedBaitCount >= 2;
        
        log('Detection results:', { 
          blockedBaitCount, 
          baitBlocked, 
          multipleBaitBlocked,
          networkBlocked, 
          imageLoaded, 
          scriptBlocked,
          fetchBlocked 
        });
        
        // More precise detection - require multiple indicators for AdBlock
        // This prevents false positives on browsers like Chrome that don't block ads
        // Be more strict on desktop devices where false positives are more common
        const isDesktop = !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) && 
                         window.innerWidth > 768;
        
        let isBlocked;
        if (isDesktop) {
          // On desktop, require stronger evidence to avoid false positives
          isBlocked = !!(multipleBaitBlocked || (baitBlocked && networkBlocked && scriptBlocked) || fetchBlocked);
        } else {
          // On mobile, use normal detection (mobile works fine)
          isBlocked = !!(multipleBaitBlocked || (baitBlocked && (networkBlocked || scriptBlocked)) || fetchBlocked);
        }
        
        // Extra check: if multiple baits are blocked, definitely AdBlock
        if (multipleBaitBlocked) {
          log('Multiple bait elements blocked - definitely AdBlock');
        }
        
        log('Final AdBlock detection:', isBlocked);
        resolve(isBlocked);
      }, timeoutMs);
    });
  }

  // House ad functions removed - no longer generating revenue

  // House ad insertion functions removed - no longer generating revenue

  // Additional PC-specific detection (including Brave browser)
  function detectPCAdblock() {
    return new Promise((resolve) => {
      // Check for common AdBlock extensions and Brave browser
      const adblockSigns = [
        // Check for Brave browser (has built-in ad blocking)
        () => {
          const isBrave = !!(navigator.brave && navigator.brave.isBrave) || 
                         navigator.userAgent.includes('Brave') ||
                         (window.chrome && window.chrome.runtime && window.chrome.runtime.id === 'mnojpmjdmbbfmejpflffifhclcmipmro');
          log('Brave browser detected:', isBrave);
          return isBrave;
        },
        // Check for Chrome browser (no built-in ad blocking)
        () => {
          const isChrome = navigator.userAgent.includes('Chrome') && !navigator.userAgent.includes('Brave');
          log('Chrome browser detected:', isChrome);
          return isChrome;
        },
        // Check for AdBlock Plus
        () => typeof window.adblockplus !== 'undefined',
        // Check for uBlock Origin
        () => typeof window.ubo !== 'undefined',
        // Check for AdGuard
        () => typeof window.adguard !== 'undefined',
        // Check for Ghostery
        () => typeof window.ghostery !== 'undefined',
        // Check for common AdBlock CSS classes
        () => {
          const testDiv = document.createElement('div');
          testDiv.className = 'adsbox';
          testDiv.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;';
          document.body.appendChild(testDiv);
          const isBlocked = getComputedStyle(testDiv).display === 'none';
          document.body.removeChild(testDiv);
          return isBlocked;
        },
        // Check for blocked ad requests (multiple sources)
        () => {
          return new Promise((resolve) => {
            let blockedCount = 0;
            let totalTests = 0;
            const adUrls = [
              'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
              'https://googleads.g.doubleclick.net/pagead/ads',
              'https://securepubads.g.doubleclick.net/gampad/ads'
            ];
            
            adUrls.forEach(url => {
              totalTests++;
              const img = new Image();
              img.onload = () => {
                totalTests--;
                if (totalTests === 0) resolve(blockedCount > 0);
              };
              img.onerror = () => {
                blockedCount++;
                totalTests--;
                if (totalTests === 0) resolve(blockedCount > 0);
              };
              img.src = url;
            });
            
            setTimeout(() => {
              if (totalTests > 0) {
                resolve(blockedCount > 0);
              }
            }, 2000);
          });
        },
        // Check for blocked fetch requests
        () => {
          return new Promise((resolve) => {
            fetch('/ads/test.js?ts=' + Date.now(), { method: 'HEAD' })
              .then(() => resolve(false))
              .catch(() => resolve(true));
          });
        }
      ];

      let detectionCount = 0;
      let blockedCount = 0;

      adblockSigns.forEach((check, index) => {
        try {
          if (typeof check === 'function') {
            const result = check();
            if (result instanceof Promise) {
              result.then(isBlocked => {
                detectionCount++;
                if (isBlocked) blockedCount++;
                if (detectionCount === adblockSigns.length) {
                  resolve(blockedCount > 0);
                }
              });
            } else {
              detectionCount++;
              if (result) blockedCount++;
              if (detectionCount === adblockSigns.length) {
                resolve(blockedCount > 0);
              }
            }
          }
        } catch(e) {
          detectionCount++;
          if (detectionCount === adblockSigns.length) {
            resolve(blockedCount > 0);
          }
        }
      });
    });
  }

  function init() {
    // Expose minimal config
    window.adConfig = window.adConfig || {};
    log('Starting AdBlock detection...');
    
    // Run both detection methods
    Promise.all([
      detectAdblock(),
      detectPCAdblock()
    ]).then(([primaryResult, pcResult]) => {
      // Check browser types and device type
      const isBrave = !!(navigator.brave && navigator.brave.isBrave) || 
                     navigator.userAgent.includes('Brave') ||
                     (window.chrome && window.chrome.runtime && window.chrome.runtime.id === 'mnojpmjdmbbfmejpflffifhclcmipmro');
      
      const isChrome = navigator.userAgent.includes('Chrome') && !navigator.userAgent.includes('Brave');
      
      // Check if it's a desktop/PC device
      const isDesktop = !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) && 
                       window.innerWidth > 768;
      
      log('Device type - Desktop:', isDesktop, 'Mobile:', !isDesktop);
      
      // For Brave browser, be more aggressive with detection
      let blocked = primaryResult || pcResult;
      if (isBrave) {
        // Brave has built-in ad blocking, but check if user disabled it
        // If primary detection shows no blocking, user might have disabled Brave's ad blocking
        if (primaryResult === false && pcResult === false) {
          // User might have disabled Brave's ad blocking
          log('Brave browser detected but no AdBlock detected - user may have disabled Brave ad blocking');
          blocked = false;
        } else {
          // Brave's ad blocking is active
          blocked = true;
          log('Brave browser detected - AdBlock is ON');
        }
      } else if (isChrome && isDesktop) {
        // For Chrome on desktop, be very conservative to avoid false positives
        // Chrome doesn't have built-in ad blocking, so only redirect if we have strong evidence
        if (primaryResult === false && pcResult === false) {
          blocked = false;
          log('Chrome desktop - No AdBlock detected - staying on clean pages');
        } else if (primaryResult === true || pcResult === true) {
          // Only redirect if we have strong evidence of AdBlock extension
          blocked = true;
          log('Chrome desktop - AdBlock extension detected - redirecting to ad-heavy pages');
        }
      } else if (isChrome && !isDesktop) {
        // For Chrome on mobile, use normal detection (mobile works fine)
        if (primaryResult === false && pcResult === false) {
          blocked = false;
          log('Chrome mobile - No AdBlock detected - staying on clean pages');
        } else if (primaryResult === true || pcResult === true) {
          blocked = true;
          log('Chrome mobile - AdBlock detected - redirecting to ad-heavy pages');
        }
      } else if (isDesktop) {
        // For other desktop browsers, be more conservative to avoid false positives
        if (primaryResult === false && pcResult === false) {
          blocked = false;
          log('Desktop browser - No AdBlock detected - staying on clean pages');
        } else if (primaryResult === true || pcResult === true) {
          blocked = true;
          log('Desktop browser - AdBlock detected - redirecting to ad-heavy pages');
        }
      } else {
        // For mobile browsers, use normal detection logic (mobile works fine)
        if (primaryResult === false && pcResult === false) {
          blocked = false;
          log('Mobile browser - No AdBlock detected - staying on clean pages');
        } else if (primaryResult === true || pcResult === true) {
          blocked = true;
          log('Mobile browser - AdBlock detected - redirecting to ad-heavy pages');
        }
      }
      
      log('Primary detection:', primaryResult, 'PC detection:', pcResult, 'Brave detected:', isBrave, 'Final:', blocked);
      window.adConfig.adBlockDetected = !!blocked;
      log('AdBlock detection completed. Result:', blocked);
      log('Setting body class to:', blocked ? 'adblock-on' : 'adblock-off');
      
      // Track AdBlock status on server
      try {
        fetch('/api/track-adblock', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            adblock: blocked,
            page: window.location.pathname,
            timestamp: new Date().toISOString()
          })
        }).then(response => {
          if (response.ok) {
            log('AdBlock status tracked on server');
          } else {
            log('Failed to track AdBlock status');
          }
        }).catch(error => {
          log('Error tracking AdBlock status:', error);
        });
      } catch (e) {
        log('Error sending AdBlock tracking request:', e);
      }
      
      try {
        document.body.classList.remove('adblock-on', 'adblock-off');
        document.body.classList.add(blocked ? 'adblock-on' : 'adblock-off');
        // Force banner visibility update
        const banner = document.getElementById('adblock-banner');
        if (banner) {
          banner.style.display = blocked ? 'block' : 'none';
          log('Banner visibility set to:', blocked ? 'block' : 'none');
        }
      } catch(e) {
        log('Error setting body class:', e);
      }
      if (blocked) {
        // Redirect AdBlock users to ad-heavy version
        log('AdBlock detected - redirecting to ad-heavy version');
        
        // Get current path and redirect to AdBlock version
        const currentPath = window.location.pathname;
        let redirectPath = '/homepageadblock'; // Default to homepage
        
        if (currentPath === '/' || currentPath === '/homepageadblock') {
          redirectPath = '/homepageadblock';
        } else if (currentPath.includes('/football')) {
          redirectPath = '/footballadblock';
        } else if (currentPath.includes('/basketball')) {
          redirectPath = '/basketballadblock';
        } else if (currentPath.includes('/tennis')) {
          redirectPath = '/tennisadblock';
        } else if (currentPath.includes('/ufc')) {
          redirectPath = '/ufcadblock';
        } else if (currentPath.includes('/rugby')) {
          redirectPath = '/rugbyadblock';
        } else if (currentPath.includes('/baseball')) {
          redirectPath = '/baseballadblock';
        } else if (currentPath.includes('/match/')) {
          // For match pages, redirect to AdBlock version
          redirectPath = currentPath.replace('/match/', '/matchadblock/');
        }
        
        // Only redirect if we're not already on an AdBlock version
        if (!currentPath.includes('adblock')) {
          log('Redirecting to:', redirectPath);
          window.location.href = redirectPath;
          return; // Stop execution to prevent further processing
        }
      } else {
        // Clean experience for non-adblock users
        log('AdBlock OFF - Clean experience');
        
        // If user is on an AdBlock version, redirect to normal version
        const currentPath = window.location.pathname;
        if (currentPath.includes('adblock')) {
          let redirectPath = '/'; // Default to homepage
          
          if (currentPath === '/homepageadblock') {
            redirectPath = '/';
          } else if (currentPath.includes('/footballadblock')) {
            redirectPath = '/football';
          } else if (currentPath.includes('/basketballadblock')) {
            redirectPath = '/basketball';
          } else if (currentPath.includes('/tennisadblock')) {
            redirectPath = '/tennis';
          } else if (currentPath.includes('/ufcadblock')) {
            redirectPath = '/ufc';
          } else if (currentPath.includes('/rugbyadblock')) {
            redirectPath = '/rugby';
          } else if (currentPath.includes('/baseballadblock')) {
            redirectPath = '/baseball';
          } else if (currentPath.includes('/matchadblock/')) {
            redirectPath = currentPath.replace('/matchadblock/', '/match/');
          }
          
          log('AdBlock turned OFF - redirecting to clean version:', redirectPath);
          window.location.href = redirectPath;
          return; // Stop execution to prevent further processing
        }
        
        // Keep existing behavior (roughly 5 ads on match page only)
        // Hide non-match ad blocks to ensure ads only appear on match pages for non-adblock users
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
        
        // Remove provider script for AdBlock OFF users
        try {
          const providerScript = document.getElementById('adblock-provider-script');
          if (providerScript) {
            providerScript.remove();
            log('Removed provider script for AdBlock OFF users');
          }
        } catch (e) {
          log('Error removing provider script:', e);
        }
      }

      // Wire up whitelist modal and actions (homepage banner)
      try {
        const openBtn = document.getElementById('whitelist-btn');
        const modal = document.getElementById('whitelist-modal');
        const closeBtn = document.getElementById('whitelist-close');
        const copyBtn = document.getElementById('whitelist-copy');
        const recheckBtn = document.getElementById('whitelist-recheck');
        const feedback = document.getElementById('whitelist-feedback');
        const domain = location.hostname.replace(/^www\./, '');

        // Debug: Add manual test button (remove in production)
        if (location.hostname === 'localhost' || location.hostname.includes('127.0.0.1')) {
          const testBtn = document.createElement('button');
          testBtn.textContent = 'TEST: Force AdBlock ON';
          testBtn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;background:red;color:white;padding:5px;border:none;cursor:pointer;';
          testBtn.onclick = () => {
            document.body.classList.remove('adblock-off');
            document.body.classList.add('adblock-on');
            const banner = document.getElementById('adblock-banner');
            if (banner) banner.style.display = 'block';
            // House ads removed - only activate provider script
            const providerScript = document.getElementById('adblock-provider-script');
            if (providerScript && !window.__adblockProviderLoaded) {
              providerScript.src = providerScript.dataset.src;
              providerScript.async = true;
              providerScript.setAttribute('data-cfasync', providerScript.dataset.cfasync);
              providerScript.dataset.zone = providerScript.dataset.zone;
              window.__adblockProviderLoaded = true;
              log('Manual test: Activated provider script');
            }
            log('Manual AdBlock ON test activated (house ads removed)');
          };
          document.body.appendChild(testBtn);
          
          // Also add a button to check detection status
          const statusBtn = document.createElement('button');
          statusBtn.textContent = 'CHECK STATUS';
          statusBtn.style.cssText = 'position:fixed;top:50px;right:10px;z-index:99999;background:blue;color:white;padding:5px;border:none;cursor:pointer;';
          statusBtn.onclick = () => {
            log('Current status:', {
              adBlockDetected: window.adConfig?.adBlockDetected,
              bodyClass: document.body.className,
              providerLoaded: window.__adblockProviderLoaded,
              bannerVisible: document.getElementById('adblock-banner')?.style.display
            });
          };
          document.body.appendChild(statusBtn);
          
          // Add a button to simulate AdBlock OFF (for testing redirect back)
          const offBtn = document.createElement('button');
          offBtn.textContent = 'TEST: Force AdBlock OFF';
          offBtn.style.cssText = 'position:fixed;top:90px;right:10px;z-index:99999;background:green;color:white;padding:5px;border:none;cursor:pointer;';
          offBtn.onclick = () => {
            document.body.classList.remove('adblock-on');
            document.body.classList.add('adblock-off');
            const banner = document.getElementById('adblock-banner');
            if (banner) banner.style.display = 'none';
            log('Manual AdBlock OFF test activated - should redirect to clean version');
            // Trigger detection again to test redirect
            setTimeout(() => {
              detectAdblock().then(blocked => {
                log('Re-detection result:', blocked);
                if (!blocked && window.location.pathname.includes('adblock')) {
                  log('Should redirect to clean version now');
                }
              });
            }, 100);
          };
          document.body.appendChild(offBtn);
        }

        if (openBtn && modal) {
          openBtn.addEventListener('click', function(e) {
            e.preventDefault();
            modal.classList.remove('hidden');
          });
        }
        if (closeBtn && modal) {
          closeBtn.addEventListener('click', function() {
            modal.classList.add('hidden');
          });
          modal.addEventListener('click', function(e) {
            if (e.target === modal) modal.classList.add('hidden');
          });
        }
        if (copyBtn) {
          copyBtn.addEventListener('click', async function() {
            try {
              await navigator.clipboard.writeText(domain);
              if (feedback) {
                feedback.textContent = 'Copied!';
                feedback.classList.remove('hidden');
                setTimeout(()=>feedback.classList.add('hidden'), 1500);
              }
            } catch (e) {}
          });
        }
        if (recheckBtn) {
          recheckBtn.addEventListener('click', function() {
            detectAdblock(800).then(isBlocked => {
              if (!isBlocked) {
                document.body.classList.remove('adblock-on');
                document.body.classList.add('adblock-off');
                if (modal) modal.classList.add('hidden');
                const banner = document.getElementById('adblock-banner');
                if (banner) banner.style.display = 'none';
                
                // Redirect to clean version if on AdBlock version
                const currentPath = window.location.pathname;
                if (currentPath.includes('adblock')) {
                  let redirectPath = '/'; // Default to homepage
                  
                  if (currentPath === '/homepageadblock') {
                    redirectPath = '/';
                  } else if (currentPath.includes('/footballadblock')) {
                    redirectPath = '/football';
                  } else if (currentPath.includes('/basketballadblock')) {
                    redirectPath = '/basketball';
                  } else if (currentPath.includes('/tennisadblock')) {
                    redirectPath = '/tennis';
                  } else if (currentPath.includes('/ufcadblock')) {
                    redirectPath = '/ufc';
                  } else if (currentPath.includes('/rugbyadblock')) {
                    redirectPath = '/rugby';
                  } else if (currentPath.includes('/baseballadblock')) {
                    redirectPath = '/baseball';
                  } else if (currentPath.includes('/matchadblock/')) {
                    redirectPath = currentPath.replace('/matchadblock/', '/match/');
                  }
                  
                  log('AdBlock disabled - redirecting to clean version:', redirectPath);
                  setTimeout(() => {
                    window.location.href = redirectPath;
                  }, 500);
                }
              } else {
                if (feedback) {
                  feedback.textContent = 'Still blocked. Please whitelist and try again.';
                  feedback.classList.remove('hidden');
                }
              }
            });
          });
        }
      } catch (e) {}
    }).catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


