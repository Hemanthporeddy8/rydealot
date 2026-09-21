/**
 * Rydealot Universal Offline Mascot Detector
 * Shows Rydo Mascot with pulsating radar animation the second connection is lost.
 * Auto-restores when internet reconnects.
 */
(function() {
  // Prevent duplicate injection
  if (document.getElementById('rydealot-offline-overlay')) return;

  // 1. Inject Styles
  var style = document.createElement('style');
  style.id = 'rydealot-offline-detector-style';
  style.textContent = `
    #rydealot-offline-overlay {
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: rgba(11, 15, 25, 0.94);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      animation: rdFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes rdFadeIn {
      from { opacity: 0; transform: scale(0.97); }
      to { opacity: 1; transform: scale(1); }
    }
    .rd-offline-card {
      max-width: 380px;
      width: 100%;
      background: #131B2E;
      border: 1.5px solid #1E293B;
      border-radius: 26px;
      padding: 32px 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 30px rgba(255, 176, 32, 0.1);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      position: relative;
    .rd-btn-close {
      position: absolute;
      top: 14px;
      right: 14px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #94A3B8;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .rd-btn-close:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
    }
    .rd-mascot-box {
      width: 150px;
      height: 160px;
      position: relative;
      margin-bottom: 16px;
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
      border: 2px dashed rgba(245, 158, 11, 0.5);
      animation: rdRadarPulse 2.6s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
    }
    .rd-pulse-ring:nth-child(2) {
      animation-delay: 1.3s;
    }
    @keyframes rdRadarPulse {
      0% { transform: scale(0.6); opacity: 0.9; }
      100% { transform: scale(1.4); opacity: 0; }
    }
    .rd-mascot-img {
      width: 125px;
      height: auto;
      max-height: 155px;
      object-fit: contain;
      position: relative;
      z-index: 2;
      filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.6));
      animation: rdMascotBob 3.2s ease-in-out infinite;
    }
    @keyframes rdMascotBob {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-7px); }
    }
    .rd-offline-title {
      font-family: 'Manrope', 'Inter', sans-serif;
      font-size: 20px;
      font-weight: 800;
      color: #fff;
      margin-bottom: 6px;
      letter-spacing: -0.3px;
    }
    .rd-offline-desc {
      font-size: 13px;
      line-height: 1.5;
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
      padding: 13px 20px;
      background: #FFB020;
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
      transition: transform 0.15s ease, background 0.15s ease;
    }
    .rd-btn-retry:hover {
      background: #F59E0B;
      transform: translateY(-1px);
    }
    .rd-btn-retry:active {
      transform: translateY(0);
    }
  `;
  document.head.appendChild(style);

  // 2. Inject Modal HTML
  var overlay = document.createElement('div');
  overlay.id = 'rydealot-offline-overlay';
  overlay.innerHTML = `
    <div class="rd-offline-card">
      <button type="button" class="rd-btn-close" id="rd-offline-close-btn" title="Dismiss">✕</button>
      <div class="rd-mascot-box">
        <div class="rd-pulse-ring"></div>
        <div class="rd-pulse-ring"></div>
        <img src="assets/mascot-offline.webp" onerror="this.src='assets/mascot-offline.png'" class="rd-mascot-img" alt="Rydo Searching For Signal">
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
      <div style="font-size:11px; color:#64748B; margin-top:12px;">
        Auto-detecting connection in background…
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // 3. Connection State Handlers
  function showOfflineModal() {
    overlay.style.display = 'flex';
  }

  function hideOfflineModal() {
    var txt = document.getElementById('rd-offline-status-text');
    if (txt) txt.textContent = '🟢 Back Online! Restoring…';
    setTimeout(function() {
      overlay.style.display = 'none';
    }, 400);
  }

  window.addEventListener('offline', showOfflineModal);
  window.addEventListener('online', hideOfflineModal);

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

      fetch('./logo.png?rd_t=' + Date.now(), { method: 'HEAD', cache: 'no-store' })
        .then(function() {
          if (txt) txt.textContent = '🟢 Connected! Reloading…';
          setTimeout(function() {
            hideOfflineModal();
            window.location.reload();
          }, 400);
        })
        .catch(function() {
          if (navigator.onLine) {
            if (txt) txt.textContent = '🟢 Reconnected! Reloading…';
            setTimeout(function() {
              hideOfflineModal();
              window.location.reload();
            }, 400);
          } else {
            if (txt) txt.textContent = 'Still Offline • Check Wi-Fi / Data';
          }
        });
    });
  }

  // Periodic background check if offline
  setInterval(function() {
    if (!navigator.onLine && overlay.style.display !== 'flex') {
      showOfflineModal();
    } else if (navigator.onLine && overlay.style.display === 'flex') {
      hideOfflineModal();
    }
  }, 3000);

  // Initial check on load
  if (!navigator.onLine) {
    showOfflineModal();
  }
})();
