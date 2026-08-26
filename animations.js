// =============================================================================
// RYDEALOT ANIMATION ENGINE (animations.js)
// Modular animations for:
// 1. Lot vehicle realistic departure (reverse out -> pivot -> drive off)
// 2. Multi-stage customer tracking animations (requested -> accepted -> arrived -> in_progress)
// 3. Dropdown in-app notifications with audio chimes and haptics
// =============================================================================

window.AppAnimations = (function() {
  'use strict';

  // Audio Context helper for synthetic chimes (no external audio files needed)
  var audioCtx = null;
  function getAudioContext() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      try {
        var AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioCtxClass();
      } catch (e) {
        console.warn('AudioContext not available:', e);
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq, startTime, duration, type, gainVal) {
    var ctx = getAudioContext();
    if (!ctx) return;
    try {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(gainVal || 0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch (e) {}
  }

  function playNotificationChime(type) {
    var ctx = getAudioContext();
    if (!ctx) return;
    var now = ctx.currentTime;
    if (type === 'accepted') {
      // Pleasant rising major chord (C5 -> E5 -> G5)
      playTone(523.25, now, 0.18, 'triangle', 0.15);
      playTone(659.25, now + 0.12, 0.22, 'triangle', 0.15);
      playTone(783.99, now + 0.24, 0.35, 'triangle', 0.2);
    } else if (type === 'arrived') {
      // High double ping (A5 -> A5)
      playTone(880.00, now, 0.12, 'sine', 0.2);
      playTone(880.00, now + 0.15, 0.28, 'sine', 0.22);
    } else if (type === 'in_progress') {
      // Gentle cruise swell (D5 -> G5)
      playTone(587.33, now, 0.15, 'sine', 0.15);
      playTone(783.99, now + 0.14, 0.30, 'sine', 0.18);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. LOT VEHICLE DEPARTURE ANIMATION (Pure SVG native coordinates)
  // ---------------------------------------------------------------------------
  function playLotDeparture(svg, slotId, onDone) {
    if (!svg) {
      if (onDone) onDone();
      return;
    }
    var wrap = svg.querySelector('.slot-wrap[data-slot="' + slotId + '"]');
    if (!wrap) {
      if (onDone) onDone();
      return;
    }

    var startX = parseFloat(wrap.getAttribute('data-x') || 0);
    var startY = parseFloat(wrap.getAttribute('data-y') || 0);
    var startRot = parseFloat(wrap.getAttribute('data-rot') || 0);

    var facingDown = (startRot === 180);
    // Top row clears to y=14, bottom row clears to y=246
    var clearY = facingDown ? 14 : 246;
    // Top row pivots to +90deg, bottom row pivots to -90deg (both face right)
    var targetRot = facingDown ? 90 : -90;
    var exitX = 440; // drive right out of SVG (viewBox width is 400)

    var duration = 1600; // ms
    var startTime = null;
    var isDone = false;

    // Remove any CSS transitions to allow direct frame control
    wrap.style.transition = 'none';

    function easeInOutQuad(t) {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }
    function easeInQuad(t) {
      return t * t;
    }

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var elapsed = timestamp - startTime;
      var p = Math.min(1, elapsed / duration);

      var curX = startX;
      var curY = startY;
      var curRot = startRot;

      if (p <= 0.32) {
        // Phase 1: Reverse straight back into aisle
        var p1 = p / 0.32;
        var e1 = easeInOutQuad(p1);
        curY = startY + (clearY - startY) * e1;
        curRot = startRot;
      } else if (p <= 0.48) {
        // Phase 2: Pivot in place to face right
        var p2 = (p - 0.32) / (0.48 - 0.32);
        var e2 = easeInOutQuad(p2);
        curY = clearY;
        curRot = startRot + (targetRot - startRot) * e2;
      } else {
        // Phase 3: Accelerate and drive straight right off the lot
        var p3 = (p - 0.48) / (1.0 - 0.48);
        var e3 = easeInQuad(p3);
        curY = clearY;
        curRot = targetRot;
        curX = startX + (exitX - startX) * e3;
      }

      wrap.setAttribute('transform', 'translate(' + curX.toFixed(2) + ',' + curY.toFixed(2) + ') rotate(' + curRot.toFixed(2) + ')');

      if (p < 1) {
        window.requestAnimationFrame(step);
      } else {
        if (!isDone) {
          isDone = true;
          if (wrap.parentNode) {
            wrap.parentNode.removeChild(wrap);
          }
          if (onDone) onDone();
        }
      }
    }

    window.requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------------------
  // 2. IN-APP NOTIFICATION BANNER
  // ---------------------------------------------------------------------------
  var notifTimeout = null;

  function showInAppNotification(options) {
    var title = options.title || 'Notification';
    var message = options.message || '';
    var type = options.type || 'accepted'; // 'accepted', 'arrived', 'in_progress', 'cancelled'
    var duration = options.duration || 4500;

    // Haptic feedback
    if (window.navigator && window.navigator.vibrate) {
      try {
        if (type === 'accepted') window.navigator.vibrate([80, 40, 120]);
        else if (type === 'arrived') window.navigator.vibrate([120, 60, 120]);
        else window.navigator.vibrate(60);
      } catch(e) {}
    }

    // Audio chime
    playNotificationChime(type);

    var container = document.getElementById('in-app-notif-box');
    if (!container) {
      container = document.createElement('div');
      container.id = 'in-app-notif-box';
      container.className = 'in-app-notif-container';
      document.body.appendChild(container);
    }

    var iconMap = {
      accepted: '🎉',
      arrived: '📍',
      in_progress: '🚀',
      cancelled: '⚠️'
    };
    var icon = options.icon || iconMap[type] || '🔔';

    var colorClass = 'notif-' + type;

    container.innerHTML = 
      '<div class="in-app-notif-card ' + colorClass + '">' +
        '<div class="in-app-notif-icon">' + icon + '</div>' +
        '<div class="in-app-notif-text">' +
          '<div class="in-app-notif-title">' + title + '</div>' +
          '<div class="in-app-notif-msg">' + message + '</div>' +
        '</div>' +
        '<button type="button" class="in-app-notif-close" aria-label="Dismiss">&times;</button>' +
      '</div>';

    container.classList.add('visible');

    var closeBtn = container.querySelector('.in-app-notif-close');
    if (closeBtn) {
      closeBtn.onclick = function() {
        dismissInAppNotification();
      };
    }
    container.onclick = function(e) {
      if (e.target.tagName !== 'BUTTON') {
        dismissInAppNotification();
      }
    };

    if (notifTimeout) clearTimeout(notifTimeout);
    notifTimeout = setTimeout(function() {
      dismissInAppNotification();
    }, duration);
  }

  function dismissInAppNotification() {
    var container = document.getElementById('in-app-notif-box');
    if (container) {
      container.classList.remove('visible');
    }
    if (notifTimeout) {
      clearTimeout(notifTimeout);
      notifTimeout = null;
    }
  }

  // ---------------------------------------------------------------------------
  // 3. MULTI-STAGE TRACKING VEHICLE ANIMATIONS
  // ---------------------------------------------------------------------------
  function setTrackingStage(stage, vehicleType, svgMarkup) {
    var iconWrap = document.getElementById('confirm-vehicle-icon');
    var banner = document.querySelector('.confirm-banner');
    if (!iconWrap) return;

    // Clean up existing stage classes
    iconWrap.className = 'confirm-vehicle-icon stage-' + stage + ' type-' + (vehicleType || 'bike');
    if (banner) {
      banner.className = 'confirm-banner banner-stage-' + stage;
    }

    var extraElements = '';

    if (stage === 'requested') {
      // Pulsing radar ripple rings around idling vehicle
      extraElements = 
        '<div class="stage-radar-wrap">' +
          '<div class="stage-radar-ring ring-1"></div>' +
          '<div class="stage-radar-ring ring-2"></div>' +
          '<div class="stage-radar-ring ring-3"></div>' +
        '</div>';
    } else if (stage === 'accepted') {
      // Active road driving animation: road line scrolling beneath vehicle + engine rumble
      extraElements = 
        '<div class="stage-road-track">' +
          '<div class="stage-road-line"></div>' +
          '<div class="stage-road-line"></div>' +
          '<div class="stage-road-line"></div>' +
        '</div>';
    } else if (stage === 'arrived') {
      // Arrived at pickup: flashing hazard light beacons on left and right
      extraElements = 
        '<div class="stage-arrived-halo"></div>' +
        '<div class="stage-hazard-light hazard-left"></div>' +
        '<div class="stage-hazard-light hazard-right"></div>';
    } else if (stage === 'in_progress') {
      // High-speed cruise: wind speed streaks + fast highway lane dashes
      extraElements = 
        '<div class="stage-speed-lines">' +
          '<span class="speed-streak s1"></span>' +
          '<span class="speed-streak s2"></span>' +
          '<span class="speed-streak s3"></span>' +
        '</div>';
    }

    iconWrap.innerHTML = 
      '<div class="stage-anim-viewport">' +
        extraElements +
        '<div class="stage-vehicle-art">' + (svgMarkup || '') + '</div>' +
      '</div>';
  }

  // ---------------------------------------------------------------------------
  // 4. SPOTLIGHT LOT VEHICLES
  // ---------------------------------------------------------------------------
  function highlightLotVehicles(svg, slotType, selectedType) {
    if (!svg) return;
    var slots = svg.querySelectorAll('.slot-wrap');
    Array.prototype.forEach.call(slots, function(slotEl) {
      var sId = slotEl.getAttribute('data-slot');
      var sType = slotType && slotType[sId];
      if (sType === selectedType) {
        slotEl.classList.add('lot-highlight');
        slotEl.style.opacity = '1';
      } else {
        slotEl.classList.remove('lot-highlight');
        slotEl.style.opacity = '0.35';
      }
    });
  }

  return {
    playLotDeparture: playLotDeparture,
    showInAppNotification: showInAppNotification,
    dismissInAppNotification: dismissInAppNotification,
    setTrackingStage: setTrackingStage,
    highlightLotVehicles: highlightLotVehicles,
    playNotificationChime: playNotificationChime
  };
})();
