/**
 * Rydealot Universal Offline Mascot Detector
 * Shows Rydo Mascot in a circular radar portal the second connection is lost.
 * Auto-restores when internet reconnects.
 * Uses active network ping to guarantee detection even when navigator.onLine gives false positives.
 */
(function() {
  // Prevent duplicate injection
  if (document.getElementById('rydealot-offline-overlay')) return;

  // 1. Inject Styles (Dark sleek card matching offline.html, 0% CPU overhead)
  var style = document.createElement('style');
  style.id = 'rydealot-offline-detector-style';
  style.textContent = `
    #rydealot-offline-overlay {
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: rgba(11, 15, 25, 0.92);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      animation: rdFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes rdFadeIn {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }
    .rd-offline-card {
      max-width: 380px;
      width: 100%;
      background: #131B2E;
      border: 1.5px solid #1E293B;
      border-radius: 26px;
      padding: 32px 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 30px rgba(255, 176, 32, 0.15);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      position: relative;
    }
    .rd-mascot-box {
      width: 150px;
      height: 150px;
      position: relative;
      margin-bottom: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .rd-pulse-ring {
      position: absolute;
      top: 50%;
      left: 50%;
      margin-top: -65px;
      margin-left: -65px;
      width: 130px;
      height: 130px;
      border-radius: 50%;
      border: 2px dashed rgba(245, 158, 11, 0.55);
      animation: rdRadarPulse 2.8s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
      pointer-events: none;
    }
    .rd-pulse-ring:nth-child(2) {
      animation-delay: 1.4s;
    }
    @keyframes rdRadarPulse {
      0% { transform: scale(0.65); opacity: 0.95; }
      100% { transform: scale(1.45); opacity: 0; }
    }
    .rd-mascot-circle {
      width: 124px;
      height: 124px;
      border-radius: 50%;
      overflow: hidden;
      position: relative;
      z-index: 2;
      border: 3px solid #FFB020;
      box-shadow: 0 0 24px rgba(255, 176, 32, 0.38), inset 0 0 16px rgba(0, 0, 0, 0.6);
      background: #0B132B;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .rd-mascot-media {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      border-radius: 50%;
      display: block;
      pointer-events: none;
    }
    .rd-offline-title {
      font-family: 'Manrope', 'Inter', sans-serif;
      font-size: 20px;
      font-weight: 800;
      color: #FFFFFF;
      margin-bottom: 8px;
      letter-spacing: -0.3px;
    }
    .rd-offline-desc {
      font-size: 13.5px;
      line-height: 1.55;
      color: #94A3B8;
      margin-bottom: 20px;
    }
    .rd-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #F59E0B;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 14px;
      border-radius: 99px;
      margin-bottom: 20px;
    }
    .rd-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #F59E0B;
      animation: rdPulseBlink 1.2s infinite alternate;
    }
    @keyframes rdPulseBlink {
      from { opacity: 0.3; }
      to { opacity: 1; }
    }
    .rd-btn-retry {
      width: 100%;
      padding: 13.5px 20px;
      background: #FFB020;
      color: #0F172A;
      border: none;
      border-radius: 14px;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 16px rgba(255, 176, 32, 0.35);
      transition: transform 0.15s ease, background 0.15s ease;
    }
    .rd-btn-retry:hover {
      background: #F59E0B;
      transform: translateY(-1px);
    }
    .rd-btn-retry:active {
      transform: translateY(0);
    }
    .rd-auto-detect-note {
      font-size: 11.5px;
      color: #64748B;
      margin-top: 14px;
      font-weight: 500;
    }
    html.app-is-offline body > *:not(#rydealot-offline-overlay) {
      display: none !important;
    }
  `;
  if (document.head) {
    document.head.appendChild(style);
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      document.head.appendChild(style);
    });
  }

  // 2. Build Modal Overlay (No Close Button, Circular Mascot Portal)
  var overlay = document.createElement('div');
  overlay.id = 'rydealot-offline-overlay';
  overlay.innerHTML = `
    <div class="rd-offline-card">
      <div class="rd-mascot-box">
        <div class="rd-pulse-ring"></div>
        <div class="rd-pulse-ring"></div>
        <div class="rd-mascot-circle">
          <video autoplay loop muted playsinline poster="assets/mascot-offline.png" class="rd-mascot-media">
            <source src="assets/video/mascot-offline.mp4" type="video/mp4">
            <img src="assets/mascot-offline.png" class="rd-mascot-media" alt="Rydo Searching For Signal">
          </video>
        </div>
      </div>
      <div class="rd-offline-title">No Internet Connection</div>
      <div class="rd-offline-desc">
        Rydo is searching for a signal! Please check your mobile data or Wi-Fi connection.
      </div>
      <div class="rd-status-pill">
        <span class="rd-status-dot"></span>
        <span id="rd-offline-status-text">Signal Disconnected</span>
      </div>
      <button type="button" class="rd-btn-retry" id="rd-offline-retry-btn">
        🔄 Try Reconnecting Now
      </button>
      <div class="rd-auto-detect-note">
        Auto-detecting connection in background…
      </div>
    </div>
  `;

  // 3. Mount overlay safely to body
  function mountOverlay() {
    if (document.getElementById('rydealot-offline-overlay')) return;
    if (document.body) {
      document.body.appendChild(overlay);
      bindRetryEvent();
      if (!navigator.onLine) {
        showOfflineModal();
      }
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        if (document.body && !document.getElementById('rydealot-offline-overlay')) {
          document.body.appendChild(overlay);
          bindRetryEvent();
          if (!navigator.onLine) {
            showOfflineModal();
          }
        }
      });
    }
  }

  // 4. Connection State Handlers
  function showOfflineModal() {
    document.documentElement.classList.add('app-is-offline');
    if (overlay) {
      overlay.style.display = 'flex';
      var txt = document.getElementById('rd-offline-status-text');
      if (txt) txt.textContent = 'Signal Disconnected';
      var vid = overlay.querySelector('video');
      if (vid && vid.paused) {
        vid.play().catch(function() {});
      }
    }
  }

  function hideOfflineModal() {
    document.documentElement.classList.remove('app-is-offline');
    var txt = document.getElementById('rd-offline-status-text');
    if (txt) txt.textContent = '🟢 Back Online! Restoring…';
    var vid = overlay.querySelector('video');
    if (vid) {
      vid.pause();
    }
    setTimeout(function() {
      if (overlay) overlay.style.display = 'none';
    }, 350);
  }

  var isChecking = false;
  function pingConnection(onSuccess, onFailure) {
    if (!navigator.onLine) {
      showOfflineModal();
      if (onFailure) onFailure();
      return;
    }
    if (isChecking) return;
    isChecking = true;

    // Use HEAD request with unique timestamp to verify live network connectivity
    fetch('./icon.svg?rd_probe=' + Date.now(), { method: 'HEAD', cache: 'no-store' })
      .then(function(res) {
        isChecking = false;
        if (res && res.ok) {
          hideOfflineModal();
          if (onSuccess) onSuccess();
        } else {
          showOfflineModal();
          if (onFailure) onFailure();
        }
      })
      .catch(function() {
        isChecking = false;
        showOfflineModal();
        if (onFailure) onFailure();
      });
  }

  function bindRetryEvent() {
    var retryBtn = document.getElementById('rd-offline-retry-btn');
    if (retryBtn && !retryBtn._bound) {
      retryBtn._bound = true;
      retryBtn.addEventListener('click', function() {
        var txt = document.getElementById('rd-offline-status-text');
        if (txt) txt.textContent = 'Testing connection…';

        pingConnection(
          function() {
            if (txt) txt.textContent = '🟢 Connected! Reloading…';
            setTimeout(function() {
              hideOfflineModal();
              window.location.reload();
            }, 350);
          },
          function() {
            if (txt) txt.textContent = 'Still Offline • Check Wi-Fi / Data';
          }
        );
      });
    }
  }

  // Event Listeners
  window.addEventListener('offline', showOfflineModal);
  window.addEventListener('online', function() {
    pingConnection();
  });

  // Periodic active network verification every 4.5 seconds
  setInterval(function() {
    pingConnection();
  }, 4500);

  // Initialize mounting immediately
  mountOverlay();

  // If already offline on script evaluation, immediately hide page and prepare overlay
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    document.documentElement.classList.add('app-is-offline');
  }
})();
