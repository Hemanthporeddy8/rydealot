/**
 * Rydealot Universal Offline Mascot Detector
 * Shows Rydo Mascot with pulsating radar animation the second connection is lost.
 * Auto-restores when internet reconnects.
 * Uses active network ping to guarantee detection even when navigator.onLine gives false positives.
 */
(function() {
  // Prevent duplicate injection
  if (document.getElementById('rydealot-offline-overlay')) return;

  // 1. Inject Styles (Optimized for 0% CPU overhead, white theme matching Rydealot)
  var style = document.createElement('style');
  style.id = 'rydealot-offline-detector-style';
  style.textContent = `
    #rydealot-offline-overlay {
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      animation: rdFadeIn 0.25s ease-out;
    }
    @keyframes rdFadeIn {
      from { opacity: 0; transform: scale(0.97); }
      to { opacity: 1; transform: scale(1); }
    }
    .rd-offline-card {
      max-width: 370px;
      width: 100%;
      background: #FFFFFF;
      border: 1.5px solid #E2E8F0;
      border-radius: 24px;
      padding: 30px 22px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 25px rgba(255, 176, 32, 0.15);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      position: relative;
    }
    .rd-btn-close {
      position: absolute;
      top: 14px;
      right: 14px;
      background: #F1F5F9;
      border: 1px solid #E2E8F0;
      color: #64748B;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .rd-btn-close:hover {
      background: #E2E8F0;
      color: #0F172A;
    }
    .rd-mascot-box {
      width: 140px;
      height: 140px;
      position: relative;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .rd-pulse-ring {
      position: absolute;
      top: 50%;
      left: 50%;
      margin-top: -60px;
      margin-left: -60px;
      width: 120px;
      height: 120px;
      border-radius: 50%;
      border: 2px dashed rgba(245, 158, 11, 0.5);
      animation: rdRadarPulse 3s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
      pointer-events: none;
    }
    .rd-pulse-ring:nth-child(2) {
      animation-delay: 1.5s;
    }
    @keyframes rdRadarPulse {
      0% { transform: scale(0.7); opacity: 0.8; }
      100% { transform: scale(1.35); opacity: 0; }
    }
    .rd-mascot-img {
      width: 125px;
      height: auto;
      max-height: 135px;
      object-fit: contain;
      position: relative;
      z-index: 2;
      filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.15));
    }
    .rd-offline-title {
      font-family: 'Manrope', 'Inter', sans-serif;
      font-size: 19px;
      font-weight: 900;
      color: #0F172A;
      margin-bottom: 6px;
      letter-spacing: -0.3px;
    }
    .rd-offline-desc {
      font-size: 13px;
      line-height: 1.5;
      color: #64748B;
      margin-bottom: 18px;
    }
    .rd-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #FFFBEB;
      border: 1.5px solid #FDE68A;
      color: #B45309;
      font-size: 12px;
      font-weight: 800;
      padding: 6px 14px;
      border-radius: 99px;
      margin-bottom: 18px;
    }
    .rd-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #D97706;
    }
    .rd-btn-retry {
      width: 100%;
      padding: 13px 20px;
      background: linear-gradient(135deg, #FFB020, #F59E0B);
      color: #0F172A;
      border: none;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 900;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 16px rgba(255, 176, 32, 0.35);
      transition: transform 0.15s ease;
    }
    .rd-btn-retry:hover {
      transform: translateY(-1px);
    }
    .rd-btn-retry:active {
      transform: translateY(0);
    }
  `;
  document.head.appendChild(style);

  // 2. Inject Modal HTML with prominent, static PNG Rydo Mascot
  var overlay = document.createElement('div');
  overlay.id = 'rydealot-offline-overlay';
  overlay.innerHTML = `
    <div class="rd-offline-card">
      <button type="button" class="rd-btn-close" id="rd-offline-close-btn" title="Dismiss">✕</button>
      <div class="rd-mascot-box">
        <div class="rd-pulse-ring"></div>
        <div class="rd-pulse-ring"></div>
        <img src="assets/mascot-offline.png" class="rd-mascot-img" alt="Rydo Searching For Signal">
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
      <div style="font-size:11px; color:#94A3B8; margin-top:12px; font-weight:600;">
        Auto-detecting connection in background…
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // 3. Connection State Handlers
  function showOfflineModal() {
    if (overlay.style.display !== 'flex') {
      overlay.style.display = 'flex';
      var txt = document.getElementById('rd-offline-status-text');
      if (txt) txt.textContent = 'Signal Disconnected';
    }
  }

  function hideOfflineModal() {
    var txt = document.getElementById('rd-offline-status-text');
    if (txt) txt.textContent = '🟢 Back Online! Restoring…';
    setTimeout(function() {
      overlay.style.display = 'none';
    }, 400);
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

    // Use HEAD request with unique timestamp. Since sw.js bypasses non-GET requests, this tests live network!
    fetch('./icon.svg?rd_probe=' + Date.now(), { method: 'HEAD', cache: 'no-store' })
      .then(function(res) {
        isChecking = false;
        if (res && res.ok) {
          if (overlay.style.display === 'flex') {
            hideOfflineModal();
          }
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

  window.addEventListener('offline', showOfflineModal);
  window.addEventListener('online', function() {
    pingConnection();
  });

  var closeBtn = document.getElementById('rd-offline-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      overlay.style.display = 'none';
    });
  }

  var retryBtn = document.getElementById('rd-offline-retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', function() {
      var txt = document.getElementById('rd-offline-status-text');
      if (txt) txt.textContent = 'Testing connection…';

      pingConnection(
        function() {
          if (txt) txt.textContent = '🟢 Connected! Reloading…';
          setTimeout(function() {
            window.location.reload();
          }, 350);
        },
        function() {
          if (txt) txt.textContent = 'Still Offline • Check Wi-Fi / Data';
        }
      );
    });
  }

  // Periodic active network verification every 4.5 seconds
  setInterval(function() {
    pingConnection();
  }, 4500);

  // Initial check immediately on load
  if (!navigator.onLine) {
    showOfflineModal();
  } else {
    // Probe network after 600ms once page settles
    setTimeout(function() {
      pingConnection();
    }, 600);
  }
})();
