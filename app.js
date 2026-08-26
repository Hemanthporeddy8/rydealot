// ===================== CUSTOM AUTHENTICATION & PROFILES MODULE =====================
(function(){
  var SUPABASE_URL = 'https://wupndimumeugfjxzejlj.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1cG5kaW11bWV1Z2ZqeHplamxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMDgwMDQsImV4cCI6MjA5NzY4NDAwNH0.dM6nG_cswzOAXuumW3LdfGJxxoF-Fn3iiVImUZ9as2Y';

  async function hashPassword(str) {
    if (!window.crypto || !window.crypto.subtle) return str;
    var encoder = new TextEncoder();
    var data = encoder.encode(str);
    var hashBuffer = await crypto.subtle.digest('SHA-256', data);
    var hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function sbAuthFetch(path, opts) {
    opts = opts || {};
    var headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };
    if(opts.prefer) headers['Prefer'] = opts.prefer;
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    var text = await res.text();
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch(e) { data = text; }
    if (!res.ok) throw new Error((data && data.message) || ('HTTP ' + res.status));
    return data;
  }

  var authState = {
    mode: 'login', // 'login' or 'register'
    role: 'customer', // 'customer' or 'driver'
    currentUser: null
  };

  // Auth UI Initialization
  function initAuthUI() {
    var tabLogin = document.getElementById('auth-tab-login');
    var tabRegister = document.getElementById('auth-tab-register');
    var fieldName = document.getElementById('field-auth-name');
    var fieldConfirmPwd = document.getElementById('field-auth-confirm-pwd');
    var submitBtn = document.getElementById('auth-submit-btn');
    var toggleText = document.getElementById('auth-toggle-text');
    var toggleLink = document.getElementById('auth-toggle-link');

    if (!tabLogin) return;

    function setAuthMode(mode) {
      authState.mode = mode;
      if (mode === 'login') {
        tabLogin.style.background = '#fff';
        tabLogin.style.color = 'var(--text)';
        tabRegister.style.background = 'transparent';
        tabRegister.style.color = 'var(--text-mute)';
        fieldName.style.display = 'none';
        if (fieldConfirmPwd) fieldConfirmPwd.style.display = 'none';
        submitBtn.textContent = 'Sign In';
        toggleText.textContent = 'New to Rydealot?';
        toggleLink.textContent = 'Create an account';
      } else {
        tabRegister.style.background = '#fff';
        tabRegister.style.color = 'var(--text)';
        tabLogin.style.background = 'transparent';
        tabLogin.style.color = 'var(--text-mute)';
        fieldName.style.display = 'block';
        if (fieldConfirmPwd) fieldConfirmPwd.style.display = 'block';
        submitBtn.textContent = 'Create Account';
        toggleText.textContent = 'Already have an account?';
        toggleLink.textContent = 'Sign in here';
      }
    }

    tabLogin.addEventListener('click', function() { setAuthMode('login'); });
    tabRegister.addEventListener('click', function() { setAuthMode('register'); });
    toggleLink.addEventListener('click', function(e) {
      e.preventDefault();
      setAuthMode(authState.mode === 'login' ? 'register' : 'login');
    });

    // Password visibility toggles
    var togglePwdBtn = document.getElementById('auth-toggle-pwd');
    if (togglePwdBtn) {
      togglePwdBtn.addEventListener('click', function() {
        var pwdInput = document.getElementById('auth-password');
        if (pwdInput.type === 'password') {
          pwdInput.type = 'text';
          togglePwdBtn.textContent = '🙈';
        } else {
          pwdInput.type = 'password';
          togglePwdBtn.textContent = '👁️';
        }
      });
    }
    var toggleConfirmPwdBtn = document.getElementById('auth-toggle-confirm-pwd');
    if (toggleConfirmPwdBtn) {
      toggleConfirmPwdBtn.addEventListener('click', function() {
        var pwdInput = document.getElementById('auth-confirm-password');
        if (pwdInput.type === 'password') {
          pwdInput.type = 'text';
          toggleConfirmPwdBtn.textContent = '🙈';
        } else {
          pwdInput.type = 'password';
          toggleConfirmPwdBtn.textContent = '👁️';
        }
      });
    }

    // Role button toggles
    var btnCustomer = document.getElementById('role-btn-customer');
    var btnDriver = document.getElementById('role-btn-driver');
    if (btnCustomer && btnDriver) {
      btnCustomer.addEventListener('click', function() {
        authState.role = 'customer';
        btnCustomer.style.background = 'var(--accent)';
        btnCustomer.style.color = '#fff';
        btnDriver.style.background = '#fff';
        btnDriver.style.color = 'var(--text)';
      });
      btnDriver.addEventListener('click', function() {
        authState.role = 'driver';
        btnDriver.style.background = 'var(--signal)';
        btnDriver.style.color = '#000';
        btnCustomer.style.background = '#fff';
        btnCustomer.style.color = 'var(--text)';
      });
    }

    // Auth Form Submission
    var authForm = document.getElementById('auth-form');
    if (authForm) {
      authForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        var email = (document.getElementById('auth-email').value || '').trim().toLowerCase();
        var rawPassword = document.getElementById('auth-password').value || '';
        var confirmPassword = (document.getElementById('auth-confirm-password') ? document.getElementById('auth-confirm-password').value : '') || '';
        var name = (document.getElementById('auth-name').value || '').trim();
        var phone = (document.getElementById('auth-phone').value || '').trim();

        if (!email || !rawPassword) {
          alert('Please enter your email and password');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';

        try {
          if (authState.mode === 'register') {
            if (!name) {
              alert('Please enter your full name');
              submitBtn.disabled = false;
              submitBtn.textContent = 'Create Account';
              return;
            }
            if (rawPassword !== confirmPassword) {
              alert('Passwords do not match. Please re-enter your password to confirm.');
              submitBtn.disabled = false;
              submitBtn.textContent = 'Create Account';
              return;
            }

            var hashedPass = await hashPassword(rawPassword);
            var userRecord = { name: name, email: email, password_hash: hashedPass, phone: phone, role: authState.role, total_rides: 0, rating: 5.0, created_at: new Date().toISOString() };

            try {
              var existing = await sbAuthFetch('users?email=eq.' + encodeURIComponent(email));
              if (existing && existing.length) {
                alert('An account with this email already exists. Please login instead.');
                submitBtn.disabled = false;
                setAuthMode('login');
                return;
              }
              var newUser = await sbAuthFetch('users', {
                method: 'POST',
                body: userRecord,
                prefer: 'return=representation'
              });
              if (newUser && newUser[0]) userRecord = newUser[0];
            } catch(tblErr) {
              console.log('Users table fallback note:', tblErr.message);
              if (authState.role === 'driver') {
                try {
                  await sbAuthFetch('riders', {
                    method: 'POST',
                    body: { name: name, phone: phone, vehicle_type: 'bike', status: 'offline', created_at: new Date().toISOString() }
                  });
                } catch(rErr){}
              }
            }

            saveUserSession(userRecord, authState.role);
          } else {
            // Login Mode
            var hashedPassLogin = await hashPassword(rawPassword);
            var user = { name: email.split('@')[0], email: email, phone: phone || '' };
            try {
              var matches = await sbAuthFetch('users?email=eq.' + encodeURIComponent(email));
              if (matches && matches.length) {
                user = matches[0];
                if (user.password_hash && user.password_hash !== hashedPassLogin) {
                  alert('Incorrect password. Please try again.');
                  submitBtn.disabled = false;
                  submitBtn.textContent = 'Sign In';
                  return;
                }
              }
            } catch(e){
              console.log('Login fallback note:', e.message);
            }
            saveUserSession(user, authState.role);
          }
        } catch(err) {
          saveUserSession({ name: email.split('@')[0], email: email, phone: phone }, authState.role);
        }
      });
    }
  }

  function saveUserSession(userRecord, role) {
    var sess = {
      id: userRecord.id || ('usr_' + Date.now()),
      name: userRecord.name || 'User',
      email: userRecord.email,
      phone: userRecord.phone || '',
      role: role,
      savedHome: userRecord.home_label || null,
      savedWork: userRecord.work_label || null
    };
    localStorage.setItem('rydealot_user_session', JSON.stringify(sess));
    authState.currentUser = sess;

    var submitBtn = document.getElementById('auth-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = authState.mode === 'login' ? 'Sign In' : 'Create Account';
    }

    applySession();
  }

  function applySession() {
    var raw = localStorage.getItem('rydealot_user_session');
    if (!raw) {
      // No active session: ensure Auth screen is shown
      var uRoot = document.getElementById('user-app-root');
      var rRoot = document.getElementById('rider-app-root');
      if (uRoot) {
        uRoot.classList.add('active');
        uRoot.style.display = 'block';
      }
      if (rRoot) {
        rRoot.classList.remove('active');
        rRoot.style.display = 'none';
      }
      var sAuth = document.getElementById('screen-auth');
      if (sAuth) {
        sAuth.classList.add('active');
        sAuth.style.display = 'flex';
      }
      return;
    }
    try {
      var sess = JSON.parse(raw);
      authState.currentUser = sess;

      var uRoot = document.getElementById('user-app-root');
      var rRoot = document.getElementById('rider-app-root');

      // Standalone driver.html page mode
      if (!uRoot && rRoot) {
        if (rRoot !== document.body) {
          rRoot.classList.add('active');
          rRoot.style.display = 'block';
        }
        var driverName = document.getElementById('rd-rider-name');
        var driverPhone = document.getElementById('rd-rider-phone');
        if (driverName && sess.name) driverName.value = sess.name;
        if (driverPhone && sess.phone) driverPhone.value = sess.phone;

        var setupSection = document.getElementById('rd-setup-section');
        var mainSection = document.getElementById('rd-main-section');
        var riderId = localStorage.getItem('ridelot_rider_id');
        var displayName = document.getElementById('rd-display-name');
        var hasValidProfile = displayName && displayName.textContent && displayName.textContent !== '-';

        if (riderId && hasValidProfile && mainSection && setupSection) {
          if (setupSection.style.display !== 'block') {
            setupSection.style.display = 'none';
            mainSection.style.display = 'block';
          }
        } else {
          if (setupSection) setupSection.style.display = 'block';
          if (mainSection) mainSection.style.display = 'none';
        }
        return;
      }

      // Standalone index.html passenger page mode
      if (uRoot && !rRoot) {
        uRoot.classList.add('active');
        uRoot.style.display = 'block';

        var hasActiveBooking = false;
        try {
          var rawBk = localStorage.getItem('rydealot_active_booking');
          if (rawBk) {
            var bk = JSON.parse(rawBk);
            if (bk && bk.bookingId) hasActiveBooking = true;
          }
        } catch(e) {}

        var hasActiveLot = false;
        try {
          var rawLot = localStorage.getItem('rydealot_lot_state');
          if (rawLot) {
            var ls = JSON.parse(rawLot);
            if (ls && ls.active && (Date.now() - (ls.timestamp || 0) < 2 * 60 * 60 * 1000)) hasActiveLot = true;
          }
        } catch(e) {}

        if (hasActiveBooking) {
          var screenAuth = document.getElementById('screen-auth');
          if (screenAuth) { screenAuth.classList.remove('active'); screenAuth.style.display = 'none'; }
          var screenLogin = document.getElementById('screen-login');
          if (screenLogin) { screenLogin.classList.remove('active'); screenLogin.style.display = 'none'; }
          var screenTrack = document.getElementById('screen-tracking');
          if (screenTrack) { screenTrack.classList.add('active'); screenTrack.style.display = 'flex'; }
        } else if (!hasActiveLot) {
          var screenAuth = document.getElementById('screen-auth');
          var screenLogin = document.getElementById('screen-login');
          if (screenAuth) {
            screenAuth.classList.remove('active');
            screenAuth.style.display = 'none';
          }
          if (screenLogin) {
            screenLogin.classList.add('active');
            screenLogin.style.display = 'flex';
          }

          if (typeof window.initSetupMap === 'function') window.initSetupMap();
          setTimeout(function(){ if (typeof state !== 'undefined' && state && state.destMap) state.destMap.invalidateSize(); }, 100);
          setTimeout(function(){ if (typeof state !== 'undefined' && state && state.destMap) state.destMap.invalidateSize(); }, 400);
        }

        var nameInput = document.getElementById('login-name');
        if (nameInput) nameInput.value = sess.name || '';

        var pName = document.getElementById('prof-name');
        var pEmail = document.getElementById('prof-email');
        var pAvatar = document.getElementById('prof-avatar');
        if (pName) pName.textContent = sess.name || 'User';
        if (pEmail) pEmail.textContent = sess.email || '';
        if (pAvatar) pAvatar.textContent = (sess.name || 'U').substring(0, 2).toUpperCase();
        updateSavedPlacesChips(sess);
        return;
      }

      // Combined page mode (if both roots exist on same page)
      if (sess.role === 'customer') {
        if (uRoot) { uRoot.classList.add('active'); uRoot.style.display = 'block'; }
        if (rRoot && rRoot !== document.body) { rRoot.classList.remove('active'); rRoot.style.display = 'none'; }

        var hasActiveBooking2 = false;
        try {
          var rawBk2 = localStorage.getItem('rydealot_active_booking');
          if (rawBk2) {
            var bk2 = JSON.parse(rawBk2);
            if (bk2 && bk2.bookingId) hasActiveBooking2 = true;
          }
        } catch(e) {}

        var hasActiveLot2 = false;
        try {
          var rawLot2 = localStorage.getItem('rydealot_lot_state');
          if (rawLot2) {
            var ls2 = JSON.parse(rawLot2);
            if (ls2 && ls2.active && (Date.now() - (ls2.timestamp || 0) < 2 * 60 * 60 * 1000)) hasActiveLot2 = true;
          }
        } catch(e) {}

        if (hasActiveBooking2) {
          var screenAuth = document.getElementById('screen-auth');
          if (screenAuth) { screenAuth.classList.remove('active'); screenAuth.style.display = 'none'; }
          var screenLogin = document.getElementById('screen-login');
          if (screenLogin) { screenLogin.classList.remove('active'); screenLogin.style.display = 'none'; }
          var screenTrack = document.getElementById('screen-tracking');
          if (screenTrack) { screenTrack.classList.add('active'); screenTrack.style.display = 'flex'; }
        } else if (!hasActiveLot2) {
          var screenAuth = document.getElementById('screen-auth');
          if (screenAuth) { screenAuth.classList.remove('active'); screenAuth.style.display = 'none'; }
          var screenLogin = document.getElementById('screen-login');
          if (screenLogin) { screenLogin.classList.add('active'); screenLogin.style.display = 'flex'; }

          if (typeof window.initSetupMap === 'function') window.initSetupMap();
          setTimeout(function(){ if (typeof state !== 'undefined' && state && state.destMap) state.destMap.invalidateSize(); }, 100);
          setTimeout(function(){ if (typeof state !== 'undefined' && state && state.destMap) state.destMap.invalidateSize(); }, 400);
        }

        var nameInput = document.getElementById('login-name');
        if (nameInput) nameInput.value = sess.name || '';
        var pName = document.getElementById('prof-name');
        var pEmail = document.getElementById('prof-email');
        var pAvatar = document.getElementById('prof-avatar');
        if (pName) pName.textContent = sess.name || 'User';
        if (pEmail) pEmail.textContent = sess.email || '';
        if (pAvatar) pAvatar.textContent = (sess.name || 'U').substring(0, 2).toUpperCase();
        updateSavedPlacesChips(sess);
      } else {
        if (rRoot && rRoot !== document.body) { rRoot.classList.add('active'); rRoot.style.display = 'block'; }
        if (uRoot) { uRoot.classList.remove('active'); uRoot.style.display = 'none'; }

        var driverName = document.getElementById('rd-rider-name');
        var driverPhone = document.getElementById('rd-rider-phone');
        if (driverName && sess.name) driverName.value = sess.name;
        if (driverPhone && sess.phone) driverPhone.value = sess.phone;

        var setupSection = document.getElementById('rd-setup-section');
        var mainSection = document.getElementById('rd-main-section');
        var riderId = localStorage.getItem('ridelot_rider_id');
        var displayName = document.getElementById('rd-display-name');
        var hasValidProfile = displayName && displayName.textContent && displayName.textContent !== '-';

        if (riderId && hasValidProfile && mainSection && setupSection) {
          if (setupSection.style.display !== 'block') {
            setupSection.style.display = 'none';
            mainSection.style.display = 'block';
          }
        } else {
          if (setupSection) setupSection.style.display = 'block';
          if (mainSection) mainSection.style.display = 'none';
        }
      }
    } catch(e) { console.error('Session error', e); }
  }

  function updateSavedPlacesChips(sess) {
    var chipHome = document.getElementById('chip-saved-home');
    var chipWork = document.getElementById('chip-saved-work');
    var profHomeLabel = document.getElementById('prof-home-label');
    var profWorkLabel = document.getElementById('prof-work-label');

    if (sess.savedHome && chipHome) {
      chipHome.style.display = 'inline-flex';
      chipHome.textContent = '🏠 ' + sess.savedHome;
      if (profHomeLabel) profHomeLabel.textContent = sess.savedHome;
    }
    if (sess.savedWork && chipWork) {
      chipWork.style.display = 'inline-flex';
      chipWork.textContent = '🏢 ' + sess.savedWork;
      if (profWorkLabel) profWorkLabel.textContent = sess.savedWork;
    }

    if (chipHome) {
      chipHome.onclick = function() {
        document.getElementById('pickup-input').value = sess.savedHome || 'Home';
      };
    }
    if (chipWork) {
      chipWork.onclick = function() {
        document.getElementById('drop-input').value = sess.savedWork || 'Work';
      };
    }
  }

  function initAppAuth() {
    initAuthUI();
    applySession();

    var btnOpenProf = document.getElementById('btn-open-user-profile');
    var btnBackProf = document.getElementById('profile-back');
    var btnLogoutProf = document.getElementById('prof-logout-btn');

    if (btnOpenProf) {
      btnOpenProf.addEventListener('click', function() {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('screen-customer-profile').classList.add('active');
      });
    }
    if (btnBackProf) {
      btnBackProf.addEventListener('click', function() {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('screen-login').classList.add('active');
      });
    }
    if (btnLogoutProf) {
      btnLogoutProf.addEventListener('click', function() {
        localStorage.removeItem('rydealot_user_session');
        location.reload();
      });
    }

    // Edit Home & Work Place Listeners
    var btnEditHome = document.getElementById('btn-edit-home');
    var btnEditWork = document.getElementById('btn-edit-work');
    if (btnEditHome) {
      btnEditHome.addEventListener('click', async function() {
        var val = prompt('Enter your Home address label (e.g. Hanamkonda Bus Stand):');
        if (val) {
          if (authState.currentUser) {
            authState.currentUser.savedHome = val;
            localStorage.setItem('rydealot_user_session', JSON.stringify(authState.currentUser));
            updateSavedPlacesChips(authState.currentUser);
            try { await sbAuthFetch('users?email=eq.' + encodeURIComponent(authState.currentUser.email), { method: 'PATCH', body: { home_label: val } }); } catch(e){}
          }
        }
      });
    }
    if (btnEditWork) {
      btnEditWork.addEventListener('click', async function() {
        var val = prompt('Enter your Work/College address label (e.g. NIT Warangal Gate 2):');
        if (val) {
          if (authState.currentUser) {
            authState.currentUser.savedWork = val;
            localStorage.setItem('rydealot_user_session', JSON.stringify(authState.currentUser));
            updateSavedPlacesChips(authState.currentUser);
            try { await sbAuthFetch('users?email=eq.' + encodeURIComponent(authState.currentUser.email), { method: 'PATCH', body: { work_label: val } }); } catch(e){}
          }
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAppAuth);
  } else {
    initAppAuth();
  }

})();

// ===================== DRIVER WALLET & FACE CHECK HANDLERS =====================
(function() {
  var btnOpenWallet = document.getElementById('rd-open-wallet-btn');
  var btnBackWallet = document.getElementById('rd-wallet-back-btn');
  var walletSection = document.getElementById('rd-wallet-section');
  var mainSection = document.getElementById('rd-main-section');

  if (btnOpenWallet && walletSection && mainSection) {
    btnOpenWallet.addEventListener('click', function() {
      mainSection.style.display = 'none';
      walletSection.style.display = 'flex';
    });
  }
  if (btnBackWallet && walletSection && mainSection) {
    btnBackWallet.addEventListener('click', function() {
      walletSection.style.display = 'none';
      mainSection.style.display = 'block';
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.btn-sub-pass'), function(btn){
    btn.addEventListener('click', function(){
      var passType = btn.getAttribute('data-pass');
      var subCfg = JSON.parse(localStorage.getItem('rydealot_sub_config') || '{"daily":25,"weekly":150,"promo":"active"}');
      var commCfg = JSON.parse(localStorage.getItem('rydealot_comm_config') || '{"perTrip":25,"minBalance":50}');
      
      var isPromoActive = subCfg.promo === 'active';
      var curBal = parseFloat(localStorage.getItem('rydealot_driver_wallet_balance') || '0');
      var price = passType === 'weekly' ? (subCfg.weekly||150) : (passType === 'daily' ? (subCfg.daily||25) : (commCfg.perTrip||25));
      var passName = passType === 'weekly' ? ('Weekly Pass (₹' + price + '/week)') : (passType === 'daily' ? ('Daily Pass (₹' + price + '/day)') : ('Per-Ride Commission (₹' + price + '/trip)'));
      
      // Insufficient Wallet Balance Check!
      if (!isPromoActive && curBal < price) {
        window.openInsufficientBalModal(curBal, price, passName);
        return;
      }

      if (passType === 'commission') {
        localStorage.setItem('rydealot_driver_active_plan', 'commission');
        localStorage.removeItem('rydealot_driver_pass_expiry');
        toast('✅ Selected Per-Ride Commission Mode! Fixed ₹' + price + ' per trip.');
        updateDriverPassTimerUI();
        return;
      }

      var durationMs = passType === 'weekly' ? (7 * 24 * 3600 * 1000) : (24 * 3600 * 1000);
      var expiryTime = Date.now() + durationMs;
      
      // Deduct pass fee from wallet balance if not promo
      if (!isPromoActive) {
        var newBal = curBal - price;
        localStorage.setItem('rydealot_driver_wallet_balance', newBal);
        var balDisplay = document.getElementById('rd-wallet-balance-display');
        if (balDisplay) balDisplay.textContent = '₹' + newBal;
      }

      localStorage.setItem('rydealot_driver_active_plan', passType);
      localStorage.setItem('rydealot_driver_pass_expiry', expiryTime);
      toast('✅ ' + passName + ' Activated Successfully!');
      updateDriverPassTimerUI();
    });
  });

  // Face Check Modal Handlers before going online
  // ===================== BIOMETRIC FACE MATCHER ENGINE =====================
  function extractFaceFeatureVector(source) {
    return new Promise(function(resolve) {
      var canvas = document.createElement('canvas');
      var size = 64;
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext('2d');

      var processCanvas = function() {
        try {
          var imgData = ctx.getImageData(0, 0, size, size);
          var data = imgData.data;
          var vector = [];

          // 1. Regional Block Luminance (8x8 blocks = 64 features)
          var blockSize = 8;
          for (var by = 0; by < 8; by++) {
            for (var bx = 0; bx < 8; bx++) {
              var blockSum = 0;
              for (var py = 0; py < blockSize; py++) {
                for (var px = 0; px < blockSize; px++) {
                  var idx = ((by * blockSize + py) * size + (bx * blockSize + px)) * 4;
                  var lum = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
                  blockSum += lum;
                }
              }
              vector.push(blockSum / (blockSize * blockSize * 255));
            }
          }

          // 2. Facial Contrast Gradients (Sobel filter for facial features: eyes, nose, mouth) (48 features)
          for (var gy = 1; gy < 7; gy++) {
            for (var gx = 1; gx < 7; gx++) {
              var cIdx = (gy * blockSize * size + gx * blockSize) * 4;
              var rIdx = (gy * blockSize * size + (gx + 1) * blockSize) * 4;
              var bIdx = ((gy + 1) * blockSize * size + gx * blockSize) * 4;
              var hDiff = Math.abs(data[cIdx] - data[rIdx]);
              var vDiff = Math.abs(data[cIdx] - data[bIdx]);
              vector.push((hDiff + vDiff) / 510);
            }
          }

          // 3. Facial Chrominance Histogram (16 features)
          var ycbcrBins = new Array(16).fill(0);
          for (var i = 0; i < data.length; i += 16) {
            var r = data[i], g = data[i + 1], b = data[i + 2];
            var cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
            var cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
            var bin = Math.floor((cb / 256) * 4) * 4 + Math.floor((cr / 256) * 4);
            if (bin >= 0 && bin < 16) ycbcrBins[bin]++;
          }
          var totalPixels = size * size / 4;
          for (var bi = 0; bi < 16; bi++) {
            vector.push(ycbcrBins[bi] / totalPixels);
          }

          // Normalize vector to unit length
          var norm = Math.sqrt(vector.reduce(function(sum, val) { return sum + val * val; }, 0)) || 1;
          var normalizedVector = vector.map(function(val) { return val / norm; });
          resolve(normalizedVector);
        } catch(e) {
          resolve(null);
        }
      };

      if (typeof source === 'string') {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
          ctx.drawImage(img, 0, 0, size, size);
          processCanvas();
        };
        img.onerror = function() { resolve(null); };
        img.src = source;
      } else {
        ctx.drawImage(source, 0, 0, size, size);
        processCanvas();
      }
    });
  }

  function computeCosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    var dotProduct = 0;
    for (var i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
    }
    return Math.max(0, Math.min(1, dotProduct));
  }

  var faceModal = document.getElementById('rd-face-modal');
  var faceCancelBtn = document.getElementById('rd-face-cancel-btn');
  var faceVideo = document.getElementById('rd-face-video');
  var faceStatus = document.getElementById('rd-face-status');
  var faceCircle = document.getElementById('rd-face-circle');
  var faceRefImg = document.getElementById('rd-face-ref-img');
  var faceRefPlaceholder = document.getElementById('rd-face-ref-placeholder');
  var faceLiveThumb = document.getElementById('rd-face-live-thumb');
  var faceRetryBtn = document.getElementById('rd-face-retry-btn');
  var mediaStream = null;

  function stopFaceCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(function(t) { t.stop(); });
      mediaStream = null;
    }
  }

  window.triggerDriverFaceCheck = async function(onSuccess) {
    if (!faceModal || !faceVideo) {
      onSuccess();
      return;
    }
    faceModal.style.display = 'flex';
    if (faceRetryBtn) faceRetryBtn.style.display = 'none';
    if (faceCircle) faceCircle.style.borderColor = 'var(--signal)';
    if (faceStatus) faceStatus.innerHTML = '<span style="color:var(--signal);">Loading registered KYC photo...</span>';

    // 1. Retrieve the registered KYC profile photo
    var riderId = (typeof state !== 'undefined' && state.riderId) || localStorage.getItem('ridelot_rider_id');
    var kycPhotoUrl = null;

    try {
      var allDocs = JSON.parse(localStorage.getItem('rydealot_driver_docs') || '{}');
      if (allDocs[riderId] && allDocs[riderId].selfie && allDocs[riderId].selfie.url) {
        kycPhotoUrl = allDocs[riderId].selfie.url;
      }
    } catch(e){}

    if (!kycPhotoUrl && riderId) {
      try {
        var cloudDocs = await sbFetch('driver_documents?rider_id=eq.' + riderId + '&doc_type=eq.selfie');
        if (cloudDocs && cloudDocs[0] && cloudDocs[0].file_url) {
          kycPhotoUrl = cloudDocs[0].file_url;
        }
      } catch(e){}
    }

    if (!kycPhotoUrl) {
      if (faceStatus) {
        faceStatus.innerHTML = '<div style="color:#ef4444; font-weight:800; font-size:12px;">⚠️ No Registered KYC Photo Found!</div>' +
          '<div style="font-size:11px; color:#cbd5e1; margin-top:4px;">You must complete <strong>Live KYC Selfie</strong> in profile before going online.</div>';
      }
      return;
    }

    // Display KYC baseline photo
    if (faceRefImg) {
      faceRefImg.src = kycPhotoUrl;
      faceRefImg.style.display = 'block';
      if (faceRefPlaceholder) faceRefPlaceholder.style.display = 'none';
    }

    // 2. Pre-extract reference vector
    if (faceStatus) faceStatus.innerHTML = '<span style="color:var(--signal);">Analyzing baseline facial biometrics...</span>';
    var refVector = await extractFaceFeatureVector(kycPhotoUrl);

    if (!refVector) {
      if (faceStatus) faceStatus.innerHTML = '<span style="color:#ef4444;">⚠️ KYC photo unreadable. Please update selfie.</span>';
      return;
    }

    // 3. Start Camera and run real biometric comparison
    var startScan = function() {
      if (faceRetryBtn) faceRetryBtn.style.display = 'none';
      if (faceCircle) faceCircle.style.borderColor = 'var(--signal)';
      if (faceStatus) faceStatus.innerHTML = '<span style="color:var(--signal);">Requesting camera access...</span>';

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } } })
          .then(function(stream) {
            mediaStream = stream;
            faceVideo.srcObject = stream;
            if (faceStatus) faceStatus.innerHTML = '<span style="color:#c7d2fe;">Position face inside circle and hold steady...</span>';

            setTimeout(async function() {
              if (!mediaStream) return;
              if (faceStatus) faceStatus.innerHTML = '<span style="color:#60a5fa;">🔍 Comparing biometrics with KYC photo...</span>';

              var samples = [];
              for (var s = 0; s < 4; s++) {
                if (!mediaStream) break;
                if (faceLiveThumb) {
                  var thumbCtx = faceLiveThumb.getContext('2d');
                  thumbCtx.drawImage(faceVideo, 0, 0, 48, 48);
                }
                var liveVec = await extractFaceFeatureVector(faceVideo);
                if (liveVec) {
                  var sim = computeCosineSimilarity(refVector, liveVec);
                  samples.push(sim);
                }
                await new Promise(function(r) { setTimeout(r, 250); });
              }

              var bestScore = samples.length ? Math.max.apply(null, samples) : 0;
              var matchPercent = Math.round(bestScore * 100);

              // Biometric match threshold (70%)
              if (bestScore >= 0.70) {
                if (faceCircle) faceCircle.style.borderColor = '#22c55e';
                if (faceStatus) {
                  faceStatus.innerHTML = '<div style="color:#22c55e; font-size:13px; font-weight:800;">✅ Face Matched (' + matchPercent + '% Similarity)!</div>' +
                    '<div style="font-size:11px; color:#86efac; margin-top:2px;">Identity Verified with Registered KYC Profile.</div>';
                }
                setTimeout(function() {
                  stopFaceCamera();
                  faceModal.style.display = 'none';
                  onSuccess();
                }, 1200);
              } else {
                if (faceCircle) faceCircle.style.borderColor = '#ef4444';
                if (faceStatus) {
                  faceStatus.innerHTML = '<div style="color:#ef4444; font-size:13px; font-weight:800;">❌ Face Mismatch (' + matchPercent + '% Match)</div>' +
                    '<div style="font-size:11px; color:#fca5a5; margin-top:2px;">Face does not match registered driver KYC photo!</div>';
                }
                if (faceRetryBtn) faceRetryBtn.style.display = 'block';
              }
            }, 1400);
          })
          .catch(function(err) {
            if (faceStatus) faceStatus.innerHTML = '<span style="color:#ef4444;">⚠️ Camera access error: ' + err.message + '</span>';
          });
      } else {
        onSuccess();
      }
    };

    if (faceRetryBtn) {
      faceRetryBtn.onclick = function() {
        stopFaceCamera();
        startScan();
      };
    }

    startScan();
  };

  if (faceCancelBtn) {
    faceCancelBtn.addEventListener('click', function() {
      stopFaceCamera();
      if (faceModal) faceModal.style.display = 'none';
    });
  }
})();

// ===================== app switcher =====================
(function(){
  var rRoot = document.getElementById('rider-app-root');
  var uRoot = document.getElementById('user-app-root');
  if (rRoot && uRoot && rRoot !== document.body && rRoot.parentElement !== document.body) {
    document.body.insertBefore(rRoot, uRoot.nextSibling);
  }

  function showApp(which){
    var rRoot = document.getElementById('rider-app-root');
    var uRoot = document.getElementById('user-app-root');

    if (rRoot && rRoot !== document.body) {
      rRoot.classList.toggle('active', which === 'rider');
      rRoot.style.display = which === 'rider' ? 'block' : 'none';
    }
    if (uRoot) {
      uRoot.classList.toggle('active', which === 'user');
      uRoot.style.display = which === 'user' ? 'block' : 'none';
    }
    
    if (which === 'user') {
      var raw = localStorage.getItem('rydealot_user_session');
      var sess = null;
      try { sess = JSON.parse(raw || '{}'); } catch(e){}
      
      var authScreen = document.getElementById('screen-auth');
      var loginScreen = document.getElementById('screen-login');
      
      var hasActiveBooking = false;
      try {
        var rawBk = localStorage.getItem('rydealot_active_booking');
        if (rawBk) {
          var bk = JSON.parse(rawBk);
          if (bk && bk.bookingId) hasActiveBooking = true;
        }
      } catch(e) {}

      var hasActiveLot = false;
      try {
        var rawLot = localStorage.getItem('rydealot_lot_state');
        if (rawLot) {
          var ls = JSON.parse(rawLot);
          if (ls && ls.active && (Date.now() - (ls.timestamp || 0) < 2 * 60 * 60 * 1000)) hasActiveLot = true;
        }
      } catch(e) {}

      // If user is already logged in, show screen-login; otherwise show screen-auth
      if (sess && (sess.phone || sess.email || sess.name)) {
        if (hasActiveBooking) {
          if (authScreen) { authScreen.classList.remove('active'); authScreen.style.display = 'none'; }
          if (loginScreen) { loginScreen.classList.remove('active'); loginScreen.style.display = 'none'; }
          var trackScreen = document.getElementById('screen-tracking');
          if (trackScreen) { trackScreen.classList.add('active'); trackScreen.style.display = 'flex'; }
        } else if (!hasActiveLot) {
          if (authScreen) { authScreen.classList.remove('active'); authScreen.style.display = 'none'; }
          if (loginScreen) { loginScreen.classList.add('active'); loginScreen.style.display = 'flex'; }
          if (typeof window.initSetupMap === 'function') window.initSetupMap();
          setTimeout(function(){
            if (typeof state !== 'undefined' && state && state.destMap) state.destMap.invalidateSize();
          }, 100);
          setTimeout(function(){
            if (typeof state !== 'undefined' && state && state.destMap) state.destMap.invalidateSize();
          }, 350);
        }
      } else {
        if (loginScreen) { loginScreen.classList.remove('active'); loginScreen.style.display = 'none'; }
        if (authScreen) { authScreen.classList.add('active'); authScreen.style.display = 'flex'; }
      }
    } else {
      // Driver side: if already registered with valid profile, show main dashboard; otherwise show setup form
      var setupSection = document.getElementById('rd-setup-section');
      var mainSection = document.getElementById('rd-main-section');
      var walletSection = document.getElementById('rd-wallet-section');
      var alongWithSection = document.getElementById('rd-along-with-section');
      var riderId = localStorage.getItem('ridelot_rider_id');

      if (walletSection) walletSection.style.display = 'none';
      if (alongWithSection) alongWithSection.style.display = 'none';

      var displayName = document.getElementById('rd-display-name');
      var hasValidProfile = displayName && displayName.textContent && displayName.textContent !== '-';

      if (riderId && hasValidProfile && mainSection && setupSection) {
        if (setupSection.style.display !== 'block') {
          setupSection.style.display = 'none';
          mainSection.style.display = 'block';
        }
      } else {
        if (setupSection) setupSection.style.display = 'block';
        if (mainSection) mainSection.style.display = 'none';
      }
    }

    window.dispatchEvent(new CustomEvent('roleswitch', { detail: { role: which } }));
  }
  var switchToRiderBtn = document.getElementById('switch-to-rider-btn');
  var switchToUserBtn = document.getElementById('switch-to-user-btn');
  if (switchToRiderBtn) switchToRiderBtn.addEventListener('click', function(e){
    // If it's an <a> link to driver.html, let the browser navigate naturally
    if (switchToRiderBtn.tagName === 'A' && switchToRiderBtn.href) return;
    e.preventDefault();
    showApp('rider');
  });
  if (switchToUserBtn) switchToUserBtn.addEventListener('click', function(e){
    // If it's an <a> link to index.html, let the browser navigate naturally
    if (switchToUserBtn.tagName === 'A' && switchToUserBtn.href) return;
    e.preventDefault();
    showApp('user');
  });
})();

// ===================== RIDER APP (own IIFE, kept separate from user app) =====================
(function(){
  var SUPABASE_URL = 'https://wupndimumeugfjxzejlj.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1cG5kaW11bWV1Z2ZqeHplamxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMDgwMDQsImV4cCI6MjA5NzY4NDAwNH0.dM6nG_cswzOAXuumW3LdfGJxxoF-Fn3iiVImUZ9as2Y';

  async function sbFetch(path, options){
    options = options || {};
    var headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    };
    if(options.prefer) headers['Prefer'] = options.prefer;
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    var text = await res.text();
    var data = null;
    try{ data = text ? JSON.parse(text) : null; } catch(e){ data = text; }
    if(!res.ok){
      var err = new Error((data && data.message) || ('HTTP ' + res.status));
      err.raw = data;
      throw err;
    }
    return data;
  }

  var state = {
    riderId: localStorage.getItem('ridelot_rider_id') || null,
    online: false,
    watchId: null,
    testLocationTimer: null,
    pollTimer: null,
    heartbeatTimer: null,
    map: null,
    driverMarker: null,
    passengerMarker: null
  };

  function toast(msg, ms){
    var t = document.getElementById('rd-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function(){ t.classList.remove('show'); }, ms || 2500);
  }

  function haversineKm(lat1, lon1, lat2, lon2){
    var R = 6371.0; // Radius of Earth in km
    var dLat = (lat2 - lat1) * Math.PI / 180.0;
    var dLon = (lon2 - lon1) * Math.PI / 180.0;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180.0) * Math.cos(lat2 * Math.PI / 180.0) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    var c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0-a));
    return R * c;
  }

  function setPill(status){
    var pill = document.getElementById('rd-status-pill');
    if (!pill) return;
    if (status === 'banned' || status === 'suspended') {
      pill.className = 'pill busy';
      pill.style.background = '#7f1d1d';
      pill.style.color = '#fca5a5';
      pill.textContent = status.toUpperCase();
      return;
    }
    pill.style.background = '';
    pill.style.color = '';
    pill.className = 'pill ' + status;
    pill.textContent = status === 'available' ? 'Available' : (status === 'busy' ? 'On a trip' : 'Offline');
  }

  var banTimerInterval = null;

  async function checkDriverBanStatus(profile) {
    var banner = document.getElementById('rd-ban-lock-banner');
    var titleEl = document.getElementById('rd-ban-title');
    var untilEl = document.getElementById('rd-ban-until');
    var reasonEl = document.getElementById('rd-ban-reason');
    var toggleBtn = document.getElementById('rd-toggle-online-btn');

    var isBanned = profile && (profile.status === 'banned' || profile.status === 'suspended');
    
    var riderId = profile ? profile.id : (state.riderId || localStorage.getItem('ridelot_rider_id'));
    var banList = JSON.parse(localStorage.getItem('rydealot_banned_drivers') || '{}');
    var banInfo = banList[riderId] || {};

    if (!isBanned && !banInfo.status && riderId) {
      try {
        var cloudBan = await sbFetch('driver_documents?rider_id=eq.' + riderId + '&doc_type=eq.ban_record');
        if (cloudBan && cloudBan[0]) {
          isBanned = true;
          try {
            var meta = JSON.parse(cloudBan[0].admin_notes);
            banInfo = { status: cloudBan[0].status, reason: meta.reason, until: meta.until };
          } catch(e) {
            banInfo = { status: cloudBan[0].status, reason: cloudBan[0].admin_notes, until: 'Indefinite' };
          }
        }
      } catch(e){}
    }

    if (banner) {
      if (isBanned || banInfo.status) {
        state.isBanned = true;
        state.online = false;
        banner.style.display = 'block';
        setPill(banInfo.status || 'suspended');

        var isPerm = (profile && profile.status === 'banned') || banInfo.status === 'banned' || banInfo.until === 'Permanent';
        if (titleEl) titleEl.textContent = isPerm ? '🚫 Account Permanently Banned' : '⏳ Account Temporarily Suspended';
        if (reasonEl) reasonEl.textContent = banInfo.reason || 'Safety / Policy violation';
        
        if (banTimerInterval) clearInterval(banTimerInterval);

        if (isPerm) {
          if (untilEl) untilEl.textContent = 'Permanent ban applied by Admin.';
        } else if (banInfo.until) {
          var updateCountdown = function() {
            var diff = new Date(banInfo.until).getTime() - new Date().getTime();
            if (diff <= 0) {
              if (untilEl) untilEl.textContent = '✅ Suspension expired! Reconnecting...';
              if (banTimerInterval) clearInterval(banTimerInterval);
              setTimeout(function(){ location.reload(); }, 1500);
              return;
            }
            var d = Math.floor(diff / (1000 * 60 * 60 * 24));
            var h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            var m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            var s = Math.floor((diff % (1000 * 60)) / 1000);
            var timeStr = (d > 0 ? d + 'd ' : '') + h + 'h ' + m + 'm ' + s + 's remaining';
            if (untilEl) untilEl.innerHTML = '⏱️ <strong>' + timeStr + '</strong><br><span style="font-size:10px; opacity:0.85;">(Until ' + banInfo.until.replace('T', ' ') + ')</span>';
          };
          updateCountdown();
          banTimerInterval = setInterval(updateCountdown, 1000);
        }

        if (toggleBtn) {
          toggleBtn.disabled = true;
          toggleBtn.style.opacity = '0.5';
          toggleBtn.style.cursor = 'not-allowed';
          toggleBtn.textContent = '🚫 Account Suspended';
          toggleBtn.className = 'btn btn-toggle-off';
        }
      } else {
        state.isBanned = false;
        if (banTimerInterval) clearInterval(banTimerInterval);
        banner.style.display = 'none';
        if (toggleBtn) {
          toggleBtn.disabled = false;
          toggleBtn.style.opacity = '1';
          toggleBtn.style.cursor = 'pointer';
          toggleBtn.textContent = state.online ? 'Go offline' : 'Go online';
        }
      }
    }
  }

  // ---------- Driver In-App Suspension Appeal Handlers ----------
  window.openDriverAppealModal = function() {
    console.log('Opening driver appeal modal');
    var modal = document.getElementById('rd-appeal-modal');
    if (modal) {
      modal.style.setProperty('display', 'flex', 'important');
      modal.style.visibility = 'visible';
    }
  };

  window.closeDriverAppealModal = function() {
    var modal = document.getElementById('rd-appeal-modal');
    if (modal) {
      modal.style.setProperty('display', 'none', 'important');
    }
  };

  window.submitDriverAppeal = async function() {
    var msgInput = document.getElementById('rd-appeal-message');
    var btn = document.getElementById('rd-submit-appeal-btn');
    var text = (msgInput ? msgInput.value : '').trim();
    if (!text) {
      toast('⚠️ Please write your explanation before submitting.');
      return;
    }
    var riderId = state.riderId || localStorage.getItem('ridelot_rider_id');
    var riderName = document.getElementById('rd-rider-name') ? document.getElementById('rd-rider-name').value : 'Driver';
    var riderPhone = document.getElementById('rd-rider-phone') ? document.getElementById('rd-rider-phone').value : '';

    if (btn) { btn.textContent = '⏳ Sending...'; btn.disabled = true; }

    try {
      // 1. Delete previous appeal
      try { await sbFetch('driver_documents?rider_id=eq.' + riderId + '&doc_type=eq.ban_appeal', { method: 'DELETE' }); } catch(e){}

      // 2. Submit new appeal record
      await sbFetch('driver_documents', {
        method: 'POST',
        body: {
          rider_id: riderId,
          doc_type: 'ban_appeal',
          file_url: 'driver_appeal_msg',
          status: 'pending_review',
          admin_notes: JSON.stringify({
            message: text,
            sent_at: new Date().toISOString(),
            driver_name: riderName,
            driver_phone: riderPhone
          })
        }
      });

      toast('✅ Appeal submitted to Admin! Admin will review shortly.');
      closeDriverAppealModal();
      var openBtn = document.getElementById('rd-open-appeal-btn');
      if (openBtn) {
        openBtn.textContent = '📩 Appeal Under Review';
        openBtn.style.background = '#3b82f6';
      }
    } catch(err) {
      toast('❌ Failed to submit appeal: ' + (err.message || 'Try again'));
    } finally {
      if (btn) { btn.textContent = '📤 Send Appeal'; btn.disabled = false; }
    }
  };

  // ---------- profile setup ----------
  // Early exit: if driver UI elements don't exist on this page, skip entire rider IIFE
  if (!document.getElementById('rd-setup-section')) return;

  async function updateDriverVerificationStatusUI(riderId) {
    riderId = riderId || state.riderId || localStorage.getItem('ridelot_rider_id');
    if (!riderId) return;
    
    var allDocs = JSON.parse(localStorage.getItem('rydealot_driver_docs') || '{}');
    var myDocs = allDocs[riderId] || {};

    // Cloud sync check from Supabase
    try {
      var cloudDocs = await sbFetch('driver_documents?rider_id=eq.' + riderId);
      if (cloudDocs && cloudDocs.length) {
        if (!allDocs[riderId]) allDocs[riderId] = {};
        cloudDocs.forEach(function(cd) {
          if (cd.doc_type && cd.file_url) {
            allDocs[riderId][cd.doc_type] = {
              url: cd.file_url,
              status: cd.status || 'pending',
              notes: cd.admin_notes || null,
              updated_at: cd.updated_at
            };
          }
        });
        localStorage.setItem('rydealot_driver_docs', JSON.stringify(allDocs));
        myDocs = allDocs[riderId];
      }
    } catch(e){}
    
    var docKeys = ['dl', 'rc', 'aadhaar', 'selfie'];
    var fullKeys = { dl: 'driving_license', rc: 'vehicle_rc', aadhaar: 'aadhaar', selfie: 'selfie' };
    var docNames = { dl: 'Driving License', rc: 'Vehicle RC', aadhaar: 'Aadhaar Card', selfie: 'Selfie Photo' };
    var uploadedCount = 0;
    var approvedCount = 0;
    var rejectedCount = 0;
    var rejectedDetails = [];

    docKeys.forEach(function(k) {
      var fullK = fullKeys[k];
      var doc = myDocs[fullK];
      var statusEl = document.getElementById('rd-doc-' + k + '-status');
      var name = docNames[k];

      if (statusEl) {
        if (doc && doc.url) {
          uploadedCount++;
          if (doc.status === 'approved') {
            approvedCount++;
            statusEl.innerHTML = '<span style="color:#16a34a; font-weight:800;">✅ Document Verified & Approved</span>';
          } else if (doc.status === 'rejected') {
            rejectedCount++;
            var reason = doc.notes ? ('Reason: "' + doc.notes + '"') : 'Re-upload needed';
            var reuploadMsg = (k === 'selfie') ? 'Tap "Take Live KYC Selfie" above to re-take.' : 'Tap "Choose File" above to re-upload a clear copy.';
            statusEl.innerHTML = '<div style="background:#fef2f2; border:1px solid #f87171; border-radius:6px; padding:6px 10px; margin-top:4px;">' +
              '<span style="color:#b91c1c; font-weight:800; font-size:12px;">❌ Rejected by Admin</span>' +
              (doc.notes ? ('<div style="color:#7f1d1d; font-size:11.5px; margin-top:2px;"><strong>Admin note:</strong> ' + doc.notes + '</div>') : '') +
              '<div style="color:#991b1b; font-size:10.5px; margin-top:2px; font-weight:600;">' + reuploadMsg + '</div>' +
            '</div>';
          } else {
            statusEl.innerHTML = '<span style="color:#d97706; font-weight:700;">⏳ Uploaded & Submitted (Pending Admin Review)</span>';
          }
        } else {
          statusEl.innerHTML = '<span style="color:var(--amber); font-weight:700;">⏳ ' + (k === 'selfie' ? 'KYC Selfie pending' : 'Upload pending') + '</span>';
        }

        if (k === 'selfie' && doc && doc.url) {
          var prevImg = document.getElementById('rd-kyc-preview-img');
          var prevIcon = document.getElementById('rd-kyc-preview-icon');
          if (prevImg) {
            prevImg.src = doc.url;
            prevImg.style.display = 'block';
          }
          if (prevIcon) prevIcon.style.display = 'none';
        }
      }
    });

    var verifDisplay = document.getElementById('rd-display-verification');
    if (verifDisplay) {
      if (approvedCount === 4) {
        verifDisplay.textContent = '✅ Verified Partner';
        verifDisplay.style.color = '#16a34a';
      } else if (rejectedCount > 0) {
        verifDisplay.textContent = '❌ Action Required (' + rejectedCount + ' Rejected)';
        verifDisplay.style.color = '#dc2626';
      } else if (approvedCount > 0) {
        verifDisplay.textContent = '⏳ ' + approvedCount + '/4 Approved (In Review)';
        verifDisplay.style.color = '#d97706';
      } else if (uploadedCount > 0) {
        verifDisplay.textContent = '⏳ Submitted (Pending Review)';
        verifDisplay.style.color = '#d97706';
      } else {
        verifDisplay.textContent = '⚠️ Not Uploaded';
        verifDisplay.style.color = '#dc2626';
      }
    }

    var banner = document.getElementById('rd-verification-status-banner');
    var iconEl = document.getElementById('rd-verif-icon');
    var titleEl = document.getElementById('rd-verif-title');
    var subEl = document.getElementById('rd-verif-subtitle');

    if (banner && iconEl && titleEl && subEl) {
      if (approvedCount === 4) {
        banner.style.background = 'linear-gradient(135deg, #f0fdf4, #dcfce7)';
        banner.style.border = '1.5px solid #16a34a';
        iconEl.textContent = '✅';
        titleEl.textContent = 'Verified Driver Partner';
        titleEl.style.color = '#15803d';
        subEl.textContent = 'All documents verified by Admin. You are ready to accept rides!';
        subEl.style.color = '#166534';
      } else if (rejectedCount > 0) {
        banner.style.background = 'linear-gradient(135deg, #fef2f2, #fee2e2)';
        banner.style.border = '1.5px solid #ef4444';
        iconEl.textContent = '❌';
        titleEl.textContent = 'Action Required (' + rejectedCount + ' Document' + (rejectedCount > 1 ? 's' : '') + ' Rejected)';
        titleEl.style.color = '#991b1b';
        subEl.textContent = rejectedDetails.join(' • ') + '. Tap below to re-upload clear photos.';
        subEl.style.color = '#b91c1c';
      } else if (approvedCount > 0) {
        banner.style.background = 'linear-gradient(135deg, #fffbeb, #fef3c7)';
        banner.style.border = '1.5px solid #f59e0b';
        iconEl.textContent = '⏳';
        titleEl.textContent = 'Verification in Progress (' + approvedCount + '/4 Approved)';
        titleEl.style.color = '#92400e';
        subEl.textContent = approvedCount + ' of 4 documents approved! Admin is reviewing the remaining documents.';
        subEl.style.color = '#b45309';
      } else if (uploadedCount > 0) {
        banner.style.background = 'linear-gradient(135deg, #fffbeb, #fef3c7)';
        banner.style.border = '1.5px solid #f59e0b';
        iconEl.textContent = '⏳';
        titleEl.textContent = 'Verification in Progress (' + uploadedCount + '/4 Docs Submitted)';
        titleEl.style.color = '#92400e';
        subEl.textContent = 'Admin will verify your documents shortly. Tap below to view or update.';
        subEl.style.color = '#b45309';
      } else {
        banner.style.background = 'linear-gradient(135deg, #fef2f2, #fee2e2)';
        banner.style.border = '1.5px solid #ef4444';
        iconEl.textContent = '⚠️';
        titleEl.textContent = 'Documents Not Uploaded';
        titleEl.style.color = '#991b1b';
        subEl.textContent = 'Please upload your DL, RC, Aadhaar & Selfie for verification.';
        subEl.style.color = '#b91c1c';
      }
    }
  }

  function loadProfileFromCache(){
    var name = localStorage.getItem('ridelot_rider_name');
    var vtype = localStorage.getItem('ridelot_rider_vtype');
    var vlabel = localStorage.getItem('ridelot_rider_vlabel');
    var plate = localStorage.getItem('ridelot_rider_plate');
    var phone = localStorage.getItem('ridelot_rider_phone');
    if (name) document.getElementById('rd-rider-name').value = name;
    if (vtype) document.getElementById('rd-rider-vtype').value = vtype;
    if (vlabel) document.getElementById('rd-rider-vlabel').value = vlabel;
    if (plate) document.getElementById('rd-rider-plate').value = plate;
    if (phone) document.getElementById('rd-rider-phone').value = phone;
    updateDriverVerificationStatusUI();
    checkDriverBanStatus();
  }

  function loadProfileIntoForm(profile){
    document.getElementById('rd-rider-name').value = profile.name || '';
    document.getElementById('rd-rider-vtype').value = profile.vehicle_type || 'bike';
    document.getElementById('rd-rider-vlabel').value = profile.vehicle_label || '';
    document.getElementById('rd-rider-plate').value = profile.plate || '';
    document.getElementById('rd-rider-phone').value = profile.phone || '';
    updateDriverVerificationStatusUI(profile.id);
    checkDriverBanStatus(profile);
  }

  async function checkDriverBroadcast() {
    var banner = document.getElementById('rd-broadcast-banner');
    var textEl = document.getElementById('rd-broadcast-text');
    if (!banner || !textEl) return;

    var localMsg = localStorage.getItem('rydealot_admin_broadcast');
    if (localMsg) {
      textEl.textContent = localMsg;
      banner.style.display = 'flex';
    }

    try {
      var rows = await sbFetch('driver_documents?doc_type=eq.admin_broadcast&status=eq.active&order=created_at.desc&limit=1');
      if (rows && rows[0] && rows[0].admin_notes) {
        textEl.textContent = rows[0].admin_notes;
        banner.style.display = 'flex';
      } else if (!localMsg) {
        banner.style.display = 'none';
      }
    } catch(e){}
  }

  var verifPollTimer = null;
  function startVerifPolling(riderId) {
    if (verifPollTimer) clearInterval(verifPollTimer);
    verifPollTimer = setInterval(function() {
      var id = state.riderId || riderId || localStorage.getItem('ridelot_rider_id');
      if (id) {
        updateDriverVerificationStatusUI(id);
      }
    }, 10000);
  }

  function showMain(profile){
    document.getElementById('rd-setup-section').style.display = 'none';
    document.getElementById('rd-main-section').style.display = 'block';
    document.getElementById('rd-display-name').textContent = profile.name;
    document.getElementById('rd-display-vehicle').textContent = profile.vehicle_label + ' (' + profile.vehicle_type + ')';
    setPill(profile.status || 'offline');
    updateDriverVerificationStatusUI(profile.id);
    checkDriverBanStatus(profile);
    checkDriverBroadcast();
    startVerifPolling(profile.id);
  }

  // Helper to read file as base64 with downscaling
  function readFileAsBase64(file) {
    return new Promise(function(resolve, reject) {
      if (!file) return resolve(null);
      var reader = new FileReader();
      reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
          var canvas = document.createElement('canvas');
          var maxDim = 800;
          var w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = function() { resolve(e.target.result); };
        img.src = e.target.result;
      };
      reader.onerror = function() { resolve(null); };
      reader.readAsDataURL(file);
    });
  }

  // Visual status indicators on file selection (for DL, RC, Aadhaar)
  ['dl', 'rc', 'aadhaar'].forEach(function(type) {
    var input = document.getElementById('rd-doc-' + type);
    var status = document.getElementById('rd-doc-' + type + '-status');
    if (input && status) {
      input.addEventListener('change', function() {
        if (input.files && input.files[0]) {
          status.textContent = '✅ ' + input.files[0].name + ' selected';
          status.style.color = 'var(--green)';
        }
      });
    }
  });

  // ===================== LIVE KYC SELFIE CAMERA HANDLERS =====================
  var kycCamModal = document.getElementById('rd-kyc-cam-modal');
  var openKycCamBtn = document.getElementById('rd-open-kyc-cam-btn');
  var kycVideo = document.getElementById('rd-kyc-video');
  var kycSnapPreview = document.getElementById('rd-kyc-snapshot-preview');
  var kycPreCapture = document.getElementById('rd-kyc-pre-capture');
  var kycPostCapture = document.getElementById('rd-kyc-post-capture');
  var kycSnapBtn = document.getElementById('rd-kyc-snap-btn');
  var kycRetakeBtn = document.getElementById('rd-kyc-retake-btn');
  var kycConfirmBtn = document.getElementById('rd-kyc-confirm-btn');
  var kycCancelBtn = document.getElementById('rd-kyc-cam-cancel-btn');
  var kycInstruction = document.getElementById('rd-kyc-instruction');
  var kycStream = null;
  var currentKycSnapshot = null;

  function stopKycCamera() {
    if (kycStream) {
      kycStream.getTracks().forEach(function(t) { t.stop(); });
      kycStream = null;
    }
  }

  if (openKycCamBtn && kycCamModal && kycVideo) {
    openKycCamBtn.addEventListener('click', function() {
      kycCamModal.style.display = 'flex';
      kycVideo.style.display = 'block';
      if (kycSnapPreview) kycSnapPreview.style.display = 'none';
      if (kycPreCapture) kycPreCapture.style.display = 'flex';
      if (kycPostCapture) kycPostCapture.style.display = 'none';
      if (kycInstruction) kycInstruction.textContent = 'Requesting camera access...';

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } } })
          .then(function(stream) {
            kycStream = stream;
            kycVideo.srcObject = stream;
            if (kycInstruction) kycInstruction.textContent = 'Center your face in the oval with good lighting';
          })
          .catch(function(err) {
            if (kycInstruction) kycInstruction.textContent = '⚠️ Camera permission error: ' + err.message;
          });
      } else {
        alert('Camera not supported in this browser.');
        kycCamModal.style.display = 'none';
      }
    });

    if (kycSnapBtn) {
      kycSnapBtn.addEventListener('click', function() {
        if (!kycVideo || !kycVideo.videoWidth) return;
        var canvas = document.createElement('canvas');
        var size = 480;
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        var vw = kycVideo.videoWidth;
        var vh = kycVideo.videoHeight;
        var minDim = Math.min(vw, vh);
        var sx = (vw - minDim) / 2;
        var sy = (vh - minDim) / 2;
        
        ctx.translate(size, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(kycVideo, sx, sy, minDim, minDim, 0, 0, size, size);

        currentKycSnapshot = canvas.toDataURL('image/jpeg', 0.85);

        if (kycSnapPreview) {
          kycSnapPreview.src = currentKycSnapshot;
          kycSnapPreview.style.display = 'block';
        }
        kycVideo.style.display = 'none';
        if (kycPreCapture) kycPreCapture.style.display = 'none';
        if (kycPostCapture) kycPostCapture.style.display = 'flex';
        if (kycInstruction) kycInstruction.textContent = 'Review your live selfie. Make sure face is clear.';
      });
    }

    if (kycRetakeBtn) {
      kycRetakeBtn.addEventListener('click', function() {
        currentKycSnapshot = null;
        if (kycSnapPreview) kycSnapPreview.style.display = 'none';
        kycVideo.style.display = 'block';
        if (kycPreCapture) kycPreCapture.style.display = 'flex';
        if (kycPostCapture) kycPostCapture.style.display = 'none';
        if (kycInstruction) kycInstruction.textContent = 'Center your face in the oval with good lighting';
      });
    }

    if (kycConfirmBtn) {
      kycConfirmBtn.addEventListener('click', function() {
        if (!currentKycSnapshot) return;
        var hiddenInput = document.getElementById('rd-doc-selfie-data');
        if (hiddenInput) hiddenInput.value = currentKycSnapshot;

        var previewImg = document.getElementById('rd-kyc-preview-img');
        var previewIcon = document.getElementById('rd-kyc-preview-icon');
        if (previewImg) {
          previewImg.src = currentKycSnapshot;
          previewImg.style.display = 'block';
        }
        if (previewIcon) previewIcon.style.display = 'none';

        var statusEl = document.getElementById('rd-doc-selfie-status');
        if (statusEl) {
          statusEl.innerHTML = '<span style="color:#16a34a; font-weight:800;">📸 Live KYC Selfie Captured (Click Save below)</span>';
        }

        stopKycCamera();
        kycCamModal.style.display = 'none';
        toast('✅ Live KYC selfie captured! Click "Save & Update All Documents" to upload.');
      });
    }

    if (kycCancelBtn) {
      kycCancelBtn.addEventListener('click', function() {
        stopKycCamera();
        kycCamModal.style.display = 'none';
      });
    }
  }

  document.getElementById('rd-save-profile-btn').addEventListener('click', async function(){
    var name = document.getElementById('rd-rider-name').value.trim();
    var vtype = document.getElementById('rd-rider-vtype').value;
    var vlabel = document.getElementById('rd-rider-vlabel').value.trim();
    var plate = document.getElementById('rd-rider-plate').value.trim();
    var phone = document.getElementById('rd-rider-phone').value.trim();
    if(!name || !vlabel || !plate){
      toast('Please fill in name, vehicle model, and plate');
      return;
    }
    var payload = { name: name, vehicle_type: vtype, vehicle_label: vlabel, plate: plate, phone: phone, status: 'offline' };

    var saveBtn = document.getElementById('rd-save-profile-btn');
    if (saveBtn) { saveBtn.textContent = '⏳ Saving documents...'; saveBtn.disabled = true; }

    try{
      var result, row;
      if(state.riderId){
        result = await sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body: payload, prefer:'return=representation' });
      } else {
        result = await sbFetch('riders', { method:'POST', body: payload, prefer:'return=representation' });
      }
      var targetRiderId = state.riderId || (row && row.id) || localStorage.getItem('ridelot_rider_id');
      if (row && row.id) {
        state.riderId = row.id;
        targetRiderId = row.id;
      }
      localStorage.setItem('ridelot_rider_id', targetRiderId);
      localStorage.setItem('ridelot_rider_name', name);
      localStorage.setItem('ridelot_rider_vtype', vtype);
      localStorage.setItem('ridelot_rider_vlabel', vlabel);
      localStorage.setItem('ridelot_rider_plate', plate);
      localStorage.setItem('ridelot_rider_phone', phone);

      // Process uploaded documents
      var dlFile = document.getElementById('rd-doc-dl') ? document.getElementById('rd-doc-dl').files[0] : null;
      var rcFile = document.getElementById('rd-doc-rc') ? document.getElementById('rd-doc-rc').files[0] : null;
      var aadhaarFile = document.getElementById('rd-doc-aadhaar') ? document.getElementById('rd-doc-aadhaar').files[0] : null;
      var selfieFile = document.getElementById('rd-doc-selfie') ? document.getElementById('rd-doc-selfie').files[0] : null;
      var selfieData = document.getElementById('rd-doc-selfie-data') ? document.getElementById('rd-doc-selfie-data').value : null;

      var docsToSave = {};
      if (dlFile) docsToSave.driving_license = await readFileAsBase64(dlFile);
      if (rcFile) docsToSave.vehicle_rc = await readFileAsBase64(rcFile);
      if (aadhaarFile) docsToSave.aadhaar = await readFileAsBase64(aadhaarFile);
      if (selfieData) {
        docsToSave.selfie = selfieData;
      } else if (selfieFile) {
        docsToSave.selfie = await readFileAsBase64(selfieFile);
      }

      if (Object.keys(docsToSave).length > 0 && targetRiderId) {
        var allDocs = JSON.parse(localStorage.getItem('rydealot_driver_docs') || '{}');
        if (!allDocs[targetRiderId]) allDocs[targetRiderId] = {};
        Object.keys(docsToSave).forEach(function(k) {
          if (docsToSave[k]) allDocs[targetRiderId][k] = { url: docsToSave[k], status: 'pending', updated_at: new Date().toISOString() };
        });
        localStorage.setItem('rydealot_driver_docs', JSON.stringify(allDocs));

        // Sync directly to Supabase driver_documents table
        for (var docType in docsToSave) {
          if (docsToSave[docType]) {
            try {
              // 1. Delete previous doc of this type for this rider
              await sbFetch('driver_documents?rider_id=eq.' + targetRiderId + '&doc_type=eq.' + docType, { method: 'DELETE' });
              // 2. Insert fresh doc record
              await sbFetch('driver_documents', {
                method: 'POST',
                body: { rider_id: targetRiderId, doc_type: docType, file_url: docsToSave[docType], status: 'pending' }
              });
            } catch(docErr) {
              console.error('Supabase doc sync note for ' + docType + ':', docErr);
            }
          }
        }
      }

      showMain(row || { id: targetRiderId, name: name, vehicle_label: vlabel, vehicle_type: vtype, plate: plate, phone: phone });
      toast('✅ Profile & documents saved successfully!');
    } catch(err){
      console.error(err);
      toast('Could not save profile: ' + (err.message || 'unknown error'));
    } finally {
      if (saveBtn) { saveBtn.textContent = 'Save profile & documents'; saveBtn.disabled = false; }
    }
  });

  var editProfileBtn = document.getElementById('rd-edit-profile-btn');
  if (editProfileBtn) {
    editProfileBtn.addEventListener('click', function(){
      var mainS = document.getElementById('rd-main-section');
      var setupS = document.getElementById('rd-setup-section');
      var walletS = document.getElementById('rd-wallet-section');
      var alongS = document.getElementById('rd-along-with-section');
      var trackingS = document.getElementById('rd-tracking-section');
      if (mainS) mainS.style.display = 'none';
      if (walletS) walletS.style.display = 'none';
      if (alongS) alongS.style.display = 'none';
      if (trackingS) trackingS.style.display = 'none';
      if (setupS) {
        setupS.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  var verifUpdateBtn = document.getElementById('rd-verif-update-btn');
  if (verifUpdateBtn) {
    verifUpdateBtn.addEventListener('click', function(){
      var mainS = document.getElementById('rd-main-section');
      var setupS = document.getElementById('rd-setup-section');
      var walletS = document.getElementById('rd-wallet-section');
      var alongS = document.getElementById('rd-along-with-section');
      var trackingS = document.getElementById('rd-tracking-section');
      if (mainS) mainS.style.display = 'none';
      if (walletS) walletS.style.display = 'none';
      if (alongS) alongS.style.display = 'none';
      if (trackingS) trackingS.style.display = 'none';
      if (setupS) {
        setupS.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      var id = state.riderId || localStorage.getItem('ridelot_rider_id');
      if (id) updateDriverVerificationStatusUI(id);
    });
  }

  var setupBackBtn = document.getElementById('rd-setup-back-btn');
  if (setupBackBtn) {
    setupBackBtn.addEventListener('click', function(){
      var setupS = document.getElementById('rd-setup-section');
      var mainS = document.getElementById('rd-main-section');
      if (setupS) setupS.style.display = 'none';
      if (mainS) {
        mainS.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  // ---------- location sharing ----------

  // Fixed test coordinates so testers don't need to share real GPS. Match
  // the same points used in the user app so a rider and a user testing
  // together actually show up near each other.
  var TEST_LOCATIONS = {
    A: { lat: 12.9716, lng: 77.5946 },
    B: { lat: 12.9740, lng: 77.5970 },
    C: { lat: 12.9690, lng: 77.5920 }
  };
  var locationMode = 'real';

  Array.prototype.forEach.call(document.querySelectorAll('.loc-mode-btn'), function(btn){
    btn.addEventListener('click', function(){
      locationMode = btn.getAttribute('data-mode');
      Array.prototype.forEach.call(document.querySelectorAll('.loc-mode-btn'), function(b){
        b.classList.toggle('selected', b === btn);
      });
      var isTest = locationMode === 'test';
      var sel = document.getElementById('rd-test-location-select');
      var help = document.getElementById('rd-test-loc-help');
      if (sel) sel.style.display = isTest ? 'block' : 'none';
      if (help) help.style.display = isTest ? 'block' : 'none';
    });
  });

  function startSharingLocation(){
    if(locationMode === 'test'){
      var sel = document.getElementById('rd-test-location-select');
      var pointKey = sel ? sel.value : 'A';
      var point = TEST_LOCATIONS[pointKey] || TEST_LOCATIONS['A'];
      document.getElementById('rd-display-location').textContent = 'Test Point ' + pointKey + ' (not real GPS)';
      async function pushTestLocation(){
        try{
          await sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body:{ lat: point.lat, lng: point.lng, updated_at: new Date().toISOString() } });
        } catch(err){ console.error('test location update failed', err); }
      }
      pushTestLocation();
      state.testLocationTimer = setInterval(pushTestLocation, 5000);
      return true;
    }
    if(!('geolocation' in navigator)){
      document.getElementById('rd-display-location').textContent = 'Error: No Geolocation support.';
      toast('This browser cannot share location');
      return false;
    }
    document.getElementById('rd-display-location').textContent = 'Step 1: Requesting GPS...';

    // Last resort: IP-based location push for laptops
    function useIpLocationForDriver() {
      document.getElementById('rd-display-location').textContent = 'Trying network location...';
      fetch('https://ipapi.co/json/')
        .then(function(r){ return r.json(); })
        .then(function(d){
          if(d && d.latitude && d.longitude){
            var lat = d.latitude, lng = d.longitude;
            state.lat = lat; state.lng = lng; // Save driver position
            document.getElementById('rd-display-location').textContent = 'Network location: ' + lat.toFixed(4) + ', ' + lng.toFixed(4);
            sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body:{ lat: lat, lng: lng, updated_at: new Date().toISOString() } })
              .catch(function(e){ console.error('IP loc push failed', e); });
            // Keep refreshing every 30s (IP location doesn't change rapidly)
            state.ipLocTimer = setInterval(function(){
              fetch('https://ipapi.co/json/')
                .then(function(r2){ return r2.json(); })
                .then(function(d2){
                  if(d2 && d2.latitude){
                    state.lat = d2.latitude; state.lng = d2.longitude; // Save driver position
                    sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body:{ lat: d2.latitude, lng: d2.longitude, updated_at: new Date().toISOString() } })
                      .catch(function(){}); 
                  }
                }).catch(function(){});
            }, 30000);
          } else {
            document.getElementById('rd-display-location').textContent = '❌ All location methods failed. Enable Location in browser settings.';
          }
        })
        .catch(function(){
          document.getElementById('rd-display-location').textContent = '❌ Network location also failed. Check internet connection.';
        });
    }
    
    function trackDriver(accuracy) {
      if (state.watchId) navigator.geolocation.clearWatch(state.watchId);
      
      state.watchId = navigator.geolocation.watchPosition(async function(pos){
        var lat = pos.coords.latitude, lng = pos.coords.longitude;
        state.lat = lat; state.lng = lng; // Save driver position
        document.getElementById('rd-display-location').textContent = 'Online: ' + lat.toFixed(4) + ', ' + lng.toFixed(4);
        try{
          await sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body:{ lat: lat, lng: lng, updated_at: new Date().toISOString() } });
        } catch(err){ console.error('location update failed', err); }
      }, function(err){
        if (accuracy && (err.code === 2 || err.code === 3)) {
          document.getElementById('rd-display-location').textContent = 'GPS failed. Trying network location...';
          trackDriver(false);
          return;
        }
        // All GPS methods failed — try IP location
        if(err.code !== 1){
          useIpLocationForDriver();
        } else {
          document.getElementById('rd-display-location').textContent = '❌ Location blocked. Open site settings → allow Location for rydealot.vercel.app';
        }
      }, { enableHighAccuracy: accuracy, maximumAge: 10000, timeout: 12000 });
    }

    trackDriver(true);
    return true;
  }

  function stopSharingLocation(){
    if(state.watchId !== null){
      navigator.geolocation.clearWatch(state.watchId);
      state.watchId = null;
    }
    clearInterval(state.testLocationTimer);
    document.getElementById('rd-display-location').textContent = 'Not sharing';
  }

  function startHeartbeat(){
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = setInterval(async function(){
      if (state.riderId && state.online) {
        try {
          await sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body:{ updated_at: new Date().toISOString() } });
        } catch(err){ console.error('heartbeat update failed', err); }
      }
    }, 15000); // 15 seconds heartbeat ping for active presence
  }

  function stopHeartbeat(){
    clearInterval(state.heartbeatTimer);
  }

  // ---------- online/offline toggle ----------
  var toggleBtn = document.getElementById('rd-toggle-online-btn');
  toggleBtn.addEventListener('click', async function(){
    if(!state.online){
      var ok = startSharingLocation();
      if(!ok) return;

      var doGoOnline = async function() {
        try{
          await sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body:{ status: 'available', updated_at: new Date().toISOString() } });
          state.online = true;
          toggleBtn.textContent = 'Go offline';
          toggleBtn.className = 'btn btn-toggle-on';
          setPill('available');
          toast('You are online and visible to nearby users');
          startPollingBookings();
          startHeartbeat();
        } catch(err){
          toast('Could not go online: ' + err.message);
        }
      };

      if (typeof window.triggerDriverFaceCheck === 'function') {
        window.triggerDriverFaceCheck(doGoOnline);
      } else {
        await doGoOnline();
      }
    } else {
      stopSharingLocation();
      stopHeartbeat();
      destroyRiderMap();
      try{
        await sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body:{ status: 'offline' } });
      } catch(err){ console.error(err); }
      state.online = false;
      toggleBtn.textContent = 'Go online';
      toggleBtn.className = 'btn btn-toggle-off';
      setPill('offline');
      stopPollingBookings();
      toast('You are offline');
    }
  });

  window.addEventListener('roleswitch', async function(e) {
    if (e.detail.role === 'user') {
      if (state.online) {
        stopSharingLocation();
        stopHeartbeat();
        destroyRiderMap();
        try{
          await sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body:{ status: 'offline' } });
        } catch(err){ console.error(err); }
        state.online = false;
        toggleBtn.textContent = 'Go online';
        toggleBtn.className = 'btn btn-toggle-off';
        setPill('offline');
        stopPollingBookings();
        toast('You went offline as driver');
      }
    }
  });

  // ---------- booking requests ----------
  function startPollingBookings(){
    fetchBookings();
    state.pollTimer = setInterval(fetchBookings, 4000);
  }
  function stopPollingBookings(){
    clearInterval(state.pollTimer);
    var el = document.getElementById('rd-bookings-list');
    if (el) el.innerHTML = '<div class="empty-state">No requests yet. Stay online to receive them.</div>';
  }

  function destroyRiderMap() {
    if (state.map) {
      try {
        state.map.remove();
      } catch (e) { console.error('Error removing rider map:', e); }
      state.map = null;
      state.driverMarker = null;
      state.passengerMarker = null;
    }
  }

  async function showRiderTracking(b) {
    var mainS = document.getElementById('rd-main-section');
    var setupS = document.getElementById('rd-setup-section');
    var walletS = document.getElementById('rd-wallet-section');
    var alongS = document.getElementById('rd-along-with-section');
    var trackS = document.getElementById('rd-tracking-section');

    if (mainS) mainS.style.display = 'none';
    if (setupS) setupS.style.display = 'none';
    if (walletS) walletS.style.display = 'none';
    if (alongS) alongS.style.display = 'none';

    if (trackS) {
      trackS.style.display = 'flex';
      trackS.style.flexDirection = 'column';
      trackS.style.gap = '14px';
      trackS.style.width = '100%';
    }

    document.getElementById('rd-track-user-name').textContent = b.user_name || 'Passenger';
    document.getElementById('rd-track-pickup').textContent = b.pickup_label || '-';
    document.getElementById('rd-track-drop').textContent = b.drop_label || '-';
    document.getElementById('rd-track-fare').textContent = 'Rs ' + (b.fare || '-');

    var actionsEl = document.getElementById('rd-track-actions');
    var buttonHtml = '';
    if (b.status === 'accepted') {
      buttonHtml = 
        '<div class="maps-link-box" style="margin: 0 0 10px 0; background: var(--bg); border-radius: 12px; padding: 10px; font-size: 13px;">' +
          'Navigate to pickup: <a href="' + mapsLinkFor(b) + '" target="_blank" rel="noopener" style="display:block; text-align:center; background:#fff; border:1.5px solid var(--border); border-radius:10px; padding:8px; font-weight:700; color:#1a73e8; text-decoration:none; margin-top:6px;">Open in Google Maps</a>' +
        '</div>' +
        '<button class="btn" style="background:var(--green); border-color:var(--green); color:#fff;" id="rd-btn-arrived">I have arrived</button>' +
        '<button class="btn btn-outline" style="border-color:#f3d4d4; color:var(--red); background:#fff; margin-top:8px;" id="rd-btn-cancel-trip">Cancel Trip</button>';
    } else if (b.status === 'arrived') {
      buttonHtml = 
        '<button class="btn" style="background:var(--signal); border-color:var(--accent); color:var(--accent);" id="rd-btn-start">Start trip</button>' +
        '<button class="btn btn-outline" style="border-color:#f3d4d4; color:var(--red); background:#fff; margin-top:8px;" id="rd-btn-cancel-trip">Cancel Trip</button>';
    } else if (b.status === 'in_progress') {
      var cleanLink = b.maps_link ? b.maps_link.replace(/[?&]pin=(\d{4})/, '') : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(b.drop_label || '');
      buttonHtml = 
        '<div class="maps-link-box" style="margin: 0 0 10px 0; background: var(--bg); border-radius: 12px; padding: 10px; font-size: 13px;">' +
          'Navigate to drop-off: <a href="' + cleanLink + '" target="_blank" rel="noopener" style="display:block; text-align:center; background:#fff; border:1.5px solid var(--border); border-radius:10px; padding:8px; font-weight:700; color:#1a73e8; text-decoration:none; margin-top:6px;">Open in Google Maps</a>' +
        '</div>' +
        '<button class="btn" style="background:var(--red); border-color:var(--red); color:#fff;" id="rd-btn-complete">Complete trip</button>' +
        '<button class="btn btn-outline" style="border-color:#f3d4d4; color:var(--red); background:#fff; margin-top:8px;" id="rd-btn-cancel-trip">Cancel Trip</button>';
    }
    actionsEl.innerHTML = buttonHtml;

    var arrivedBtn = document.getElementById('rd-btn-arrived');
    var startBtn = document.getElementById('rd-btn-start');
    var completeBtn = document.getElementById('rd-btn-complete');
    var cancelTripBtn = document.getElementById('rd-btn-cancel-trip');
    
    if (cancelTripBtn) {
      cancelTripBtn.addEventListener('click', async function(){
        if(!confirm('Are you sure you want to cancel this trip?')) return;
        try {
          await sbFetch('bookings?id=eq.' + b.id, { method: 'PATCH', body: { status: 'cancelled' } });
          await sbFetch('riders?id=eq.' + state.riderId, { method: 'PATCH', body: { status: 'available' } });
          setPill('available');
          toast('Trip cancelled');
          destroyRiderMap();
          document.getElementById('rd-tracking-section').style.display = 'none';
          document.getElementById('rd-main-section').style.display = 'block';
          fetchBookings();
        } catch(err) {
          toast('Could not cancel trip: ' + err.message);
        }
      });
    }
    
  function openDriverPinModal(correctPin, onVerified) {
    var modal = document.getElementById('rd-pin-modal');
    var input = document.getElementById('rd-input-pin');
    var errorMsg = document.getElementById('rd-pin-error-msg');
    var cancelBtn = document.getElementById('rd-pin-cancel-btn');
    var verifyBtn = document.getElementById('rd-pin-verify-btn');

    if (!modal || !input) {
      var entered = prompt("Enter 4-digit Ride PIN from passenger's device:");
      if (entered && entered.trim() === correctPin) onVerified();
      return;
    }

    input.value = '';
    if (errorMsg) {
      errorMsg.style.display = 'none';
      errorMsg.textContent = '';
    }
    modal.style.display = 'flex';
    setTimeout(function(){ input.focus(); }, 100);

    function doVerify() {
      var val = (input.value || '').trim();
      if (!val || val.length < 4) {
        if (errorMsg) {
          errorMsg.textContent = '⚠️ Please enter the full 4-digit PIN';
          errorMsg.style.display = 'block';
        }
        return;
      }
      if (val !== correctPin) {
        if (errorMsg) {
          errorMsg.textContent = '❌ Incorrect PIN. Check passenger phone.';
          errorMsg.style.display = 'block';
        }
        input.value = '';
        input.focus();
        return;
      }

      modal.style.display = 'none';
      onVerified();
    }

    function doCancel() {
      modal.style.display = 'none';
    }

    if (verifyBtn) verifyBtn.onclick = doVerify;
    if (cancelBtn) cancelBtn.onclick = doCancel;
    input.onkeydown = function(e) {
      if (e.key === 'Enter') doVerify();
      if (e.key === 'Escape') doCancel();
    };
  }

  if (arrivedBtn) arrivedBtn.addEventListener('click', function() { handleBookingAction('arrived', b.id); });
  if (startBtn) {
    startBtn.addEventListener('click', function() {
      var pinMatch = b.maps_link ? b.maps_link.match(/[?&]pin=(\d{4})/) : null;
      var correctPin = pinMatch ? pinMatch[1] : null;
      
      if (correctPin) {
        openDriverPinModal(correctPin, function() {
          var cleanLink = b.maps_link ? b.maps_link.replace(/[?&]pin=(\d{4})/, '') : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(b.drop_label || '');
          window.open(cleanLink, '_blank');
          handleBookingAction('start', b.id);
        });
      } else {
        var cleanLink = b.maps_link ? b.maps_link.replace(/[?&]pin=(\d{4})/, '') : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(b.drop_label || '');
        window.open(cleanLink, '_blank');
        handleBookingAction('start', b.id);
      }
    });
  }
  if (completeBtn) completeBtn.addEventListener('click', function() { handleBookingAction('complete', b.id); });

    try {
      var riderRows = await sbFetch('riders?id=eq.' + state.riderId);
      var r = riderRows[0];
      var dLat = (r && r.lat != null) ? r.lat : b.pickup_lat;
      var dLng = (r && r.lng != null) ? r.lng : b.pickup_lng;
      
      var pLat = b.pickup_lat;
      var pLng = b.pickup_lng;

      if (!state.map) {
        state.map = L.map('rd-map', {
          zoomControl: false,
          attributionControl: false
        }).setView([dLat, dLng], 15);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          maxZoom: 19
        }).addTo(state.map);

        var vType = (r && r.vehicle_type) ? r.vehicle_type : 'auto';
        var vIconEmoji = vType === 'bike' ? '🏍️' : (vType === 'auto' ? '🛺' : '🚗');

        var driverIcon = L.divIcon({
          html: '<div style="background:#16181c; color:#fff; padding:5px 10px; border-radius:20px; font-size:11px; font-weight:800; border:2px solid #fff; box-shadow:0 3px 10px rgba(0,0,0,0.4); display:flex; align-items:center; gap:5px; whitespace:nowrap;">' +
                  '<span>' + vIconEmoji + '</span><span>YOU (DRIVER)</span>' +
                '</div>',
          className: 'custom-rider-icon',
          iconSize: [110, 32],
          iconAnchor: [55, 16]
        });
        state.driverMarker = L.marker([dLat, dLng], { icon: driverIcon }).addTo(state.map);

        if (pLat != null && pLng != null) {
          var passengerIcon = L.divIcon({
            html: '<div style="background:#1d9e75; color:#fff; padding:5px 10px; border-radius:20px; font-size:11px; font-weight:800; border:2px solid #fff; box-shadow:0 3px 10px rgba(0,0,0,0.4); display:flex; align-items:center; gap:5px; whitespace:nowrap;">' +
                    '<span>👤</span><span>PASSENGER (PICKUP)</span>' +
                  '</div>',
            className: 'custom-passenger-icon',
            iconSize: [140, 32],
            iconAnchor: [70, 16]
          });
          state.passengerMarker = L.marker([pLat, pLng], { icon: passengerIcon }).addTo(state.map);
        }
      } else {
        if (state.driverMarker) state.driverMarker.setLatLng([dLat, dLng]);
        if (state.passengerMarker && pLat != null && pLng != null) state.passengerMarker.setLatLng([pLat, pLng]);
      }

      if (state.map) {
        setTimeout(function() {
          if (state.map) state.map.invalidateSize();
        }, 150);
        if (dLat != null && dLng != null && pLat != null && pLng != null) {
          var bounds = L.latLngBounds([[dLat, dLng], [pLat, pLng]]);
          state.map.fitBounds(bounds, { padding: [25, 25] });
        } else {
          state.map.setView([dLat, dLng], 15);
        }
      }
    } catch (err) {
      console.error('Failed to update driver map:', err);
    }
  }

  function playRideRequestAudioChime() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.3); // E6 note
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch(e){}
  }

  function showBrowserPushNotification(title, body) {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body: body, icon: '/icon.svg' });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(function(permission) {
          if (permission === 'granted') {
            new Notification(title, { body: body, icon: '/icon.svg' });
          }
        });
      }
    }
  }

  var lastTrackedBookingId = null;

  async function fetchBookings(){
    if(!state.riderId || !state.online) return;

    // Do not interrupt driver if they are in Setup / Edit Profile mode
    var setupS = document.getElementById('rd-setup-section');
    if (setupS && setupS.style.display !== 'none') return;

    try{
      var rows = await sbFetch('bookings?rider_id=eq.' + state.riderId + '&status=in.(requested,accepted,arrived,in_progress)&order=created_at.desc');
      
      var activeBooking = (rows || []).find(function(b){
        return b.status === 'accepted' || b.status === 'arrived' || b.status === 'in_progress';
      });

      if (activeBooking) {
        lastTrackedBookingId = activeBooking.id;
        showRiderTracking(activeBooking);
      } else {
        // If driver was previously tracking an active booking and it got cancelled by user
        if (lastTrackedBookingId) {
          toast('⚠️ Passenger cancelled this trip');
          lastTrackedBookingId = null;
          // Set driver status back to available in DB
          try {
            await sbFetch('riders?id=eq.' + state.riderId, { method: 'PATCH', body: { status: 'available', updated_at: new Date().toISOString() } });
            state.online = true;
            setPill('available');
          } catch(e) { console.error('Reset status failed', e); }
        }

        var trackingS = document.getElementById('rd-tracking-section');
        if (trackingS && trackingS.style.display !== 'none') {
          trackingS.style.display = 'none';
          destroyRiderMap();
          var curSetup = document.getElementById('rd-setup-section');
          var curWallet = document.getElementById('rd-wallet-section');
          var curAlong = document.getElementById('rd-along-with-section');
          if ((!curSetup || curSetup.style.display === 'none') && (!curWallet || curWallet.style.display === 'none') && (!curAlong || curAlong.style.display === 'none')) {
            document.getElementById('rd-main-section').style.display = 'block';
          }
        }
        
        var requests = (rows || []).filter(function(b){ return b.status === 'requested'; });
        if (requests.length > 0 && !window._lastRideReqCount) {
          playRideRequestAudioChime();
          showBrowserPushNotification('🚗 New Ride Request nearby!', 'Tap to open Rydealot and accept booking.');
        }
        window._lastRideReqCount = requests.length;
        renderBookings(requests);
      }
    } catch(err){
      console.error('fetch bookings failed', err);
    }
  }

  function mapsLinkFor(b){
    if(b.pickup_lat && b.pickup_lng){
      return 'https://www.google.com/maps/dir/?api=1&destination=' + b.pickup_lat + ',' + b.pickup_lng + '&travelmode=driving';
    }
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(b.pickup_label || '');
  }

  function renderBookings(list){
    var el = document.getElementById('rd-bookings-list');
    if(!list.length){
      el.innerHTML = '<div class="empty-state">No requests yet. Stay online to receive them.</div>';
      return;
    }
    el.innerHTML = list.map(function(b){
      var actions = '';
      if(b.status === 'requested'){
        actions = '<div class="booking-actions">' +
          '<button class="btn btn-decline" data-action="decline" data-id="'+b.id+'">Decline</button>' +
          '<button class="btn" data-action="accept" data-id="'+b.id+'">Accept</button>' +
        '</div>';
      }

      // Calculate distances in real time
      var pickupDistText = '';
      if(state.lat && state.lng && b.pickup_lat && b.pickup_lng){
        var dToPickup = haversineKm(state.lat, state.lng, b.pickup_lat, b.pickup_lng);
        pickupDistText = ' <span style="color:var(--accent); font-weight:700;">(' + dToPickup.toFixed(1) + ' km away)</span>';
      }

      var tripDistText = '';
      if(b.pickup_lat && b.pickup_lng && b.maps_link){
        var match = b.maps_link.match(/destination=(-?\d+\.\d+),(-?\d+\.\d+)/);
        if(match){
          var dLat = parseFloat(match[1]);
          var dLng = parseFloat(match[2]);
          var dTrip = haversineKm(b.pickup_lat, b.pickup_lng, dLat, dLng);
          tripDistText = ' <span style="color:var(--green); font-weight:700;">(' + dTrip.toFixed(1) + ' km ride)</span>';
        }
      }

      return '<div class="booking-card">' +
        '<h3>'+(b.user_name || 'Rider request')+' \u2014 '+(b.vehicle_type||'')+'</h3>' +
        '<div class="meta" style="line-height:1.6;">' +
          '<strong>Pickup:</strong> '+(b.pickup_label||'-')+pickupDistText+'<br>' +
          '<strong>Drop:</strong> '+(b.drop_label||'-')+tripDistText+'<br>' +
          '<strong>Fare:</strong> Rs '+(b.fare||'-')+'</div>' +
        actions +
      '</div>';
    }).join('');

    Array.prototype.forEach.call(el.querySelectorAll('button[data-action]'), function(btn){
      btn.addEventListener('click', function(){ handleBookingAction(btn.getAttribute('data-action'), btn.getAttribute('data-id')); });
    });
  }

  async function handleBookingAction(action, bookingId){
    var statusMap = { accept:'accepted', decline:'cancelled', arrived:'arrived', start:'in_progress', complete:'completed' };
    var newStatus = statusMap[action];
    try{
      await sbFetch('bookings?id=eq.' + bookingId, { method:'PATCH', body:{ status: newStatus } });
      if(action === 'accept'){
        await sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body:{ status: 'busy' } });
        setPill('busy');
      }
      if(action === 'complete' || action === 'decline'){
        await sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body:{ status: 'available' } });
        setPill('available');
      }
      if(action === 'complete'){
        var activePlan = localStorage.getItem('rydealot_driver_active_plan');
        if (activePlan === 'commission') {
          var commCfg = JSON.parse(localStorage.getItem('rydealot_comm_config') || '{"perTrip":25}');
          var commFee = commCfg.perTrip || 25;
          var curBal = parseFloat(localStorage.getItem('rydealot_driver_wallet_balance') || '0');
          var newBal = curBal - commFee;
          localStorage.setItem('rydealot_driver_wallet_balance', newBal);
          toast('💸 Per-Trip Commission ₹' + commFee + ' deducted from wallet.');
        }
      }
      toast('Updated');
      fetchBookings();
    } catch(err){
      toast('Could not update: ' + err.message);
    }
  }

  // ---------- init ----------
  async function init(){
    loadProfileFromCache();
    if(state.riderId){
      try{
        var rows = await sbFetch('riders?id=eq.' + state.riderId);
        var row = rows && rows[0];
        if(!row){
          localStorage.removeItem('ridelot_rider_id');
          state.riderId = null;
          var setupS = document.getElementById('rd-setup-section');
          var mainS = document.getElementById('rd-main-section');
          if (setupS) setupS.style.display = 'block';
          if (mainS) mainS.style.display = 'none';
        } else {
          loadProfileIntoForm(row);
          showMain(row);
          if(row.status === 'available'){
            state.online = true;
            toggleBtn.textContent = 'Go offline';
            toggleBtn.className = 'btn btn-toggle-on';
            startSharingLocation();
            startPollingBookings();
            startHeartbeat();
          }
          return;
        }
      } catch(err){
        console.error('Rider init note:', err);
        localStorage.removeItem('ridelot_rider_id');
        state.riderId = null;
        var setupS2 = document.getElementById('rd-setup-section');
        var mainS2 = document.getElementById('rd-main-section');
        if (setupS2) setupS2.style.display = 'block';
        if (mainS2) mainS2.style.display = 'none';
      }
    }
  }
  init();
})();

// ===================== USER APP (own IIFE, kept separate from rider app) =====================
(function(){
  var SUPABASE_URL = 'https://wupndimumeugfjxzejlj.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1cG5kaW11bWV1Z2ZqeHplamxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMDgwMDQsImV4cCI6MjA5NzY4NDAwNH0.dM6nG_cswzOAXuumW3LdfGJxxoF-Fn3iiVImUZ9as2Y';

  // No SDK — talks to Supabase's REST API directly with plain fetch. The
  // SDK's UMD build was throwing a DataCloneError on some devices; this
  // sidesteps that class of bug entirely and is what we confirmed actually
  // works end to end in the connection test.
  async function sbFetch(path, options){
    options = options || {};
    var headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    };
    if(options.prefer) headers['Prefer'] = options.prefer;
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    var text = await res.text();
    var data = null;
    try{ data = text ? JSON.parse(text) : null; } catch(e){ data = text; }
    if(!res.ok){
      var err = new Error((data && data.message) || ('HTTP ' + res.status));
      err.raw = data;
      throw err;
    }
    return data;
  }

  // Early exit: if user/passenger UI elements don't exist on this page (e.g. driver.html), skip passenger IIFE
  if (!document.getElementById('user-app-root') && !document.getElementById('screen-login')) return;

  // ---------------- inline icon library (no external font dependency) ----------------
  var ICONS = {
    'arrow-left': '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    'bell': '<path d="M6 8a6 6 0 1112 0c0 3 1 4 1.5 5.5H4.5C5 12 6 11 6 8z"/><path d="M9.5 17a2.5 2.5 0 005 0"/>',
    'car': '<path d="M3 13l1.5-4.5A2 2 0 016.4 7h11.2a2 2 0 011.9 1.5L21 13"/><rect x="2.5" y="13" width="19" height="5.5" rx="1.5"/><circle cx="7" cy="18.5" r="1.5"/><circle cx="17" cy="18.5" r="1.5"/>',
    'cash': '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v0M18 15v0"/>',
    'check': '<path d="M5 12l5 5L20 7"/>',
    'chevron-right': '<path d="M9 6l6 6-6 6"/>',
    'circle-check': '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.3 2.3L16 10"/>',
    'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    'credit-card': '<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6 14.5h4"/>',
    'headset': '<path d="M4 13a8 8 0 0116 0"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M19 19v1a3 3 0 01-3 3h-3"/>',
    'home': '<path d="M4 11.5L12 4l8 7.5"/><path d="M6 10v9.5a1 1 0 001 1h10a1 1 0 001-1V10"/><path d="M10 20v-5h4v5"/>',
    'logout': '<path d="M9 7V5.5A1.5 1.5 0 0110.5 4h6A1.5 1.5 0 0118 5.5v13a1.5 1.5 0 01-1.5 1.5h-6A1.5 1.5 0 019 18.5V17"/><path d="M3 12h11.5"/><path d="M11.5 8.5L15 12l-3.5 3.5"/>',
    'map-pin': '<path d="M12 21s7-6.2 7-11.5a7 7 0 10-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    'message-circle': '<path d="M4 12a8 8 0 1114.5 4.6L20 20l-4-1.2A8 8 0 014 12z"/>',
    'motorbike': '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l3-7h4l1 3M13 10l2.5 7M9 17h9"/><circle cx="15.5" cy="7" r="1.2"/>',
    'phone': '<path d="M5 4.5h3.5L10 9l-2 1.5a11 11 0 005.5 5.5L15 14l4.5 1.5V19a1.5 1.5 0 01-1.5 1.5C10.5 20.5 3.5 13.5 3.5 6A1.5 1.5 0 015 4.5z"/>',
    'qrcode': '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 14h2v2M14 19h2v2M19 19h2v2"/>',
    'user': '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>',
    'user-circle': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="2.7"/><path d="M6.5 18a6 6 0 0111 0"/>',
    'x': '<path d="M6 6l12 12M18 6L6 18"/>'
  };

  function iconSvg(name){
    var inner = ICONS[name] || '';
    return '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-0.15em;">'+inner+'</svg>';
  }

  function replaceIconPlaceholders(){
    Array.prototype.forEach.call(document.querySelectorAll('i.ti'), function(el){
      var cls = el.className.match(/ti-([a-z0-9-]+)/);
      if(!cls) return;
      var name = cls[1];
      var holder = document.createElement('span');
      holder.className = el.className;
      if(el.getAttribute('style')) holder.setAttribute('style', el.getAttribute('style'));
      holder.innerHTML = iconSvg(name);
      holder.style.color = 'inherit';
      if(el.hasAttribute('aria-hidden')) holder.setAttribute('aria-hidden','true');
      el.replaceWith(holder);
    });
  }
  replaceIconPlaceholders();

  // ---------------- app state ----------------
  var state = {
    userName: '',
    pickup: 'Pickup point',
    drop: 'Drop point',
    lat: null,
    lng: null,
    selectedRideType: 'bike',
    realRiderCount: 0,
    activeBookingId: null,
    activeRider: null,
    activeType: null,
    activePrice: null,
    currentRider: null,
    currentType: null,
    currentFare: null,
    lastKnownStatus: null,
    exitAnimationPlayed: false,
    trackAnimPlayed: false,
    bookingPollTimer: null,
    map: null,
    driverMarker: null,
    passengerMarker: null,
    destLat: null,
    destLng: null,
    destMap: null,
    destMarker: null,
    isBookingInProgress: false
  };

  function saveLotState() {
    try {
      localStorage.setItem('rydealot_lot_state', JSON.stringify({
        active: true,
        userName: state.userName,
        pickup: state.pickup,
        drop: state.drop,
        lat: state.lat,
        lng: state.lng,
        destLat: state.destLat,
        destLng: state.destLng,
        tripDistanceKm: state.tripDistanceKm,
        tripDurationMin: state.tripDurationMin,
        selectedRideType: state.selectedRideType || 'bike',
        timestamp: Date.now()
      }));
    } catch(e) {}
  }

  function clearLotState() {
    try {
      localStorage.removeItem('rydealot_lot_state');
    } catch(e) {}
  }

  function toast(msg, ms){
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function(){ t.classList.remove('show'); }, ms || 2200);
  }

  // ---------------- screen navigation ----------------
  function showScreen(id){
    Array.prototype.forEach.call(document.querySelectorAll('.screen'), function(s){
      s.classList.remove('active');
      s.style.display = 'none';
    });
    var target = document.getElementById(id);
    if (target) {
      target.classList.add('active');
      target.style.display = 'flex';
    }
    if (id === 'screen-login') {
      if (typeof window.initSetupMap === 'function') window.initSetupMap();
      setTimeout(function(){
        if (typeof state !== 'undefined' && state && state.destMap) state.destMap.invalidateSize();
      }, 100);
    }
  }

  function setActiveTab(name){
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function(t){
      t.classList.toggle('active', t.getAttribute('data-tab') === name);
    });
  }

  // Fixed test coordinates so testers don't need to share their real GPS.
  // Close together (a few hundred metres apart) so a rider and a user who
  // both pick the same test point actually show up near each other.
  var TEST_LOCATIONS = {
    A: { lat: 12.9716, lng: 77.5946 },
    B: { lat: 12.9740, lng: 77.5970 },
    C: { lat: 12.9690, lng: 77.5920 }
  };
  var locationMode = 'real';

  Array.prototype.forEach.call(document.querySelectorAll('.loc-mode-btn'), function(btn){
    btn.addEventListener('click', function(){
      locationMode = btn.getAttribute('data-mode');
      Array.prototype.forEach.call(document.querySelectorAll('.loc-mode-btn'), function(b){
        b.classList.toggle('selected', b === btn);
      });
      var isTest = locationMode === 'test';
      var sel = document.getElementById('test-location-select');
      var help = document.getElementById('test-loc-help');
      if (sel) sel.style.display = isTest ? 'block' : 'none';
      if (help) help.style.display = isTest ? 'block' : 'none';
      
      var loginBtn = document.getElementById('login-btn');
      if (loginBtn) {
        loginBtn.textContent = isTest
          ? 'Use test location and find riders'
          : 'Share my location and find riders';
      }
      
      if(isTest) {
        var pointKey = sel ? sel.value : 'A';
        var point = TEST_LOCATIONS[pointKey] || TEST_LOCATIONS['A'];
        state.lat = point.lat;
        state.lng = point.lng;
        document.getElementById('pickup-input').value = 'Test Point ' + pointKey;
        updateSetupMapMarkers();
      } else {
        autoFindLocation();
      }
    });
  });

  var testLocSelect = document.getElementById('test-location-select');
  if (testLocSelect) {
    testLocSelect.addEventListener('change', function(){
      if (locationMode === 'test') {
        var pointKey = this.value;
        var point = TEST_LOCATIONS[pointKey] || TEST_LOCATIONS['A'];
        state.lat = point.lat;
        state.lng = point.lng;
        document.getElementById('pickup-input').value = 'Test Point ' + pointKey;
        updateSetupMapMarkers();
      }
    });
  }

  // ---- Setup Map Initialization and Update Functions ----
  var setupMapInitialized = false;
  var currentSetupMapTheme = 'light';
  var setupMapTileLayer = null;

  var SETUP_MAP_THEMES = {
    light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
  };

  function setSetupMapTheme(theme) {
    if (!state.destMap) return;
    currentSetupMapTheme = theme;
    if (setupMapTileLayer) state.destMap.removeLayer(setupMapTileLayer);
    setupMapTileLayer = L.tileLayer(SETUP_MAP_THEMES[theme], { maxZoom: 19 }).addTo(state.destMap);
    var btn = document.getElementById('btn-toggle-map-theme');
    if (btn) btn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
  }

  function autoSaveCustomerLandmark(name, lat, lng) {
    if (!name || !lat || !lng) return;
    name = name.trim();
    var lower = name.toLowerCase();
    if (lower.startsWith('current location') || lower.startsWith('pinned destination') || lower.startsWith('test point') || name.length < 3) return;

    var exists = TELANGANA_LANDMARKS.some(function(lm){
      return lm.name.toLowerCase() === lower || lm.aliases.some(function(a){ return a === lower; });
    });

    if (!exists) {
      var newLm = {
        name: name,
        aliases: [lower],
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        type: 'place',
        detail: 'Customer Ride Input'
      };
      TELANGANA_LANDMARKS.unshift(newLm);

      try {
        sbAuthFetch('map_places', {
          method: 'POST',
          body: {
            name: name,
            category: 'customer_ride',
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            address: 'Customer Ride Input'
          }
        });
      } catch(e){}
    }
  }

  function initSetupMap() {
    if (typeof L === 'undefined') {
      setTimeout(initSetupMap, 300);
      return;
    }
    if (setupMapInitialized) {
      if (state.destMap) {
        setTimeout(function(){ state.destMap.invalidateSize(); }, 150);
      }
      return;
    }
    
    var defaultLat = 17.9961;
    var defaultLng = 79.5509; // Kazipet / Hanamakonda area center
    
    state.destMap = L.map('setup-map', { zoomControl: true }).setView([defaultLat, defaultLng], 13);
    
    setupMapTileLayer = L.tileLayer(SETUP_MAP_THEMES['light'], {
      maxZoom: 19
    }).addTo(state.destMap);

    var btnTheme = document.getElementById('btn-toggle-map-theme');
    if (btnTheme) {
      btnTheme.addEventListener('click', function(){
        var next = currentSetupMapTheme === 'dark' ? 'light' : 'dark';
        setSetupMapTheme(next);
      });
    }

    // Clicking anywhere on the map pins the Destination (Drop point)
    state.destMap.on('click', function(e) {
      var lat = e.latlng.lat;
      var lng = e.latlng.lng;
      state.destLat = lat;
      state.destLng = lng;
      updateSetupMapMarkers();
      
      var dropInput = document.getElementById('drop-input');
      dropInput.value = 'Pinned Destination (' + lat.toFixed(4) + ', ' + lng.toFixed(4) + ')';
      updateMapAddressPill(lat, lng);
    });

    setupMapInitialized = true;
    renderSetupMapLandmarks();
    updateSetupMapMarkers();
  }
  window.initSetupMap = initSetupMap;

  var reverseGeoTimer = null;
  function updateMapAddressPill(lat, lng) {
    var pill = document.getElementById('map-address-pill');
    var txt = document.getElementById('map-address-text');
    if (!pill || !txt) return;

    pill.style.display = 'flex';
    txt.textContent = 'Locating street address...';

    clearTimeout(reverseGeoTimer);
    reverseGeoTimer = setTimeout(function(){
      fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng + '&zoom=18&addressdetails=1', {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'RydealotApp/1.0' }
      })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (data && data.display_name) {
          var addr = data.address || {};
          var mainStr = addr.road || addr.suburb || addr.neighbourhood || addr.village || data.display_name.split(',')[0];
          var subStr = [addr.city||addr.town||addr.county, addr.state, addr.postcode].filter(Boolean).join(', ');
          txt.textContent = mainStr + (subStr ? ', ' + subStr : '');
        } else {
          txt.textContent = lat.toFixed(4) + ', ' + lng.toFixed(4);
        }
      })
      .catch(function(){
        txt.textContent = lat.toFixed(4) + ', ' + lng.toFixed(4);
      });
    }, 350);
  }

  function renderSetupMapLandmarks() {
    if (!state.destMap || typeof TELANGANA_LANDMARKS === 'undefined') return;
    TELANGANA_LANDMARKS.slice(0, 16).forEach(function(lm) {
      var iconEmoji = lm.type === 'bus_stop' ? '🚌' : (lm.type === 'station' ? '🚆' : (lm.type === 'hospital' ? '🏥' : (lm.type === 'school' ? '🏫' : (lm.type === 'temple' ? '🛕' : (lm.type === 'restaurant' ? '🍗' : '📍')))));
      L.marker([lm.lat, lm.lng], {
        icon: L.divIcon({
          html: '<div style="background:rgba(255,255,255,0.92); border:1.5px solid #1c1e21; color:#1c1e21; padding:2px 6px; border-radius:6px; font-weight:800; font-size:10px; display:flex; align-items:center; gap:3px; box-shadow:0 3px 8px rgba(0,0,0,0.25); white-space:nowrap;"><span>'+iconEmoji+'</span><span>'+lm.name.split('(')[0].trim()+'</span></div>',
          className: 'custom-map-landmark-badge',
          iconSize: [110, 20],
          iconAnchor: [55, 10]
        })
      }).addTo(state.destMap);
    });
  }

  function updateSetupMapMarkers() {
    if (!state.destMap) return;

    // 1. Pickup Marker (Green Dot)
    if (state.lat && state.lng) {
      if (!state.setupPickupMarker) {
        state.setupPickupMarker = L.marker([state.lat, state.lng], {
          icon: L.divIcon({
            html: '<div style="background-color:var(--green); width:14px; height:14px; border-radius:50%; border:2px solid white; box-shadow:0 0 5px rgba(0,0,0,0.4);"></div>',
            className: 'custom-pickup-pin',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          })
        }).addTo(state.destMap);
      } else {
        state.setupPickupMarker.setLatLng([state.lat, state.lng]);
      }
    } else {
      if (state.setupPickupMarker) {
        state.destMap.removeLayer(state.setupPickupMarker);
        state.setupPickupMarker = null;
      }
    }

    // 2. Drop Marker (Red Dot)
    if (state.destLat && state.destLng) {
      if (!state.setupDropMarker) {
        state.setupDropMarker = L.marker([state.destLat, state.destLng], {
          icon: L.divIcon({
            html: '<div style="background-color:var(--red); width:14px; height:14px; border-radius:50%; border:2px solid white; box-shadow:0 0 5px rgba(0,0,0,0.4);"></div>',
            className: 'custom-drop-pin',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          })
        }).addTo(state.destMap);
      } else {
        state.setupDropMarker.setLatLng([state.destLat, state.destLng]);
      }
      updateMapAddressPill(state.destLat, state.destLng);
    } else {
      if (state.setupDropMarker) {
        state.destMap.removeLayer(state.setupDropMarker);
        state.setupDropMarker = null;
      }
      if (state.lat && state.lng) updateMapAddressPill(state.lat, state.lng);
    }

    // 3. Polyline and Bounds Fitting (Actual Street Routing using OSRM)
    if (state.lat && state.lng && state.destLat && state.destLng) {
      var url = 'https://router.project-osrm.org/route/v1/driving/' + state.lng + ',' + state.lat + ';' + state.destLng + ',' + state.destLat + '?overview=full&geometries=geojson';
      
      fetch(url)
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data.routes && data.routes.length > 0) {
            var coords = data.routes[0].geometry.coordinates;
            var path = coords.map(function(c) { return [c[1], c[0]]; }); // Convert [lng, lat] to [lat, lng]
            
            if (state.setupPolyline) {
              state.setupPolyline.setLatLngs(path);
              // Reset path options to solid line
              state.setupPolyline.setStyle({ color: 'var(--accent)', dashArray: null, weight: 4 });
            } else {
              state.setupPolyline = L.polyline(path, {
                color: 'var(--accent)',
                weight: 4,
                opacity: 0.8
              }).addTo(state.destMap);
            }
            state.destMap.fitBounds(L.latLngBounds(path), { padding: [50, 50] });
          } else {
            drawStraightLine();
          }
        })
        .catch(function() {
          drawStraightLine();
        });
    } else {
      if (state.setupPolyline) {
        state.destMap.removeLayer(state.setupPolyline);
        state.setupPolyline = null;
      }
      if (state.lat && state.lng) {
        state.destMap.setView([state.lat, state.lng], 14);
      } else if (state.destLat && state.destLng) {
        state.destMap.setView([state.destLat, state.destLng], 14);
      }
    }

    function drawStraightLine() {
      var points = [
        [state.lat, state.lng],
        [state.destLat, state.destLng]
      ];
      if (state.setupPolyline) {
        state.setupPolyline.setLatLngs(points);
        state.setupPolyline.setStyle({ color: 'var(--accent)', dashArray: '4, 6', weight: 3 });
      } else {
        state.setupPolyline = L.polyline(points, {
          color: 'var(--accent)',
          dashArray: '4, 6',
          weight: 3
        }).addTo(state.destMap);
      }
      state.destMap.fitBounds(L.latLngBounds(points), { padding: [50, 50] });
    }
  }

  function autoFindLocation() {
    document.getElementById('loc-status').textContent = 'Locating you...';
    
    function tryLocation(highAccuracy) {
      var watchId = navigator.geolocation.watchPosition(function(pos){
        state.lat = pos.coords.latitude;
        state.lng = pos.coords.longitude;
        navigator.geolocation.clearWatch(watchId);
        
        var pickupInput = document.getElementById('pickup-input');
        if(!pickupInput.value || pickupInput.value.startsWith('Current Location') || pickupInput.value.startsWith('Test Point')) {
          pickupInput.value = 'Current Location';
        }
        document.getElementById('loc-status').textContent = '🟢 Location active';
        updateSetupMapMarkers();
      }, function(err){
        navigator.geolocation.clearWatch(watchId);
        if(highAccuracy && (err.code === 2 || err.code === 3)){
          document.getElementById('loc-status').textContent = 'GPS failed. Trying network location...';
          tryLocation(false);
          return;
        }
        if(err.code !== 1){
          document.getElementById('loc-status').textContent = 'Trying network location (IP-based)...';
          fetch('https://ipapi.co/json/')
            .then(function(r){ return r.json(); })
            .then(function(d){
              if(d && d.latitude && d.longitude){
                state.lat = d.latitude;
                state.lng = d.longitude;
                var pickupInput = document.getElementById('pickup-input');
                if(!pickupInput.value || pickupInput.value.startsWith('Current Location') || pickupInput.value.startsWith('Test Point')) {
                  pickupInput.value = 'Current Location (approx)';
                }
                document.getElementById('loc-status').textContent = '🟢 Network location active';
                updateSetupMapMarkers();
              } else {
                document.getElementById('loc-status').textContent = '❌ Could not get location. Try enabling GPS.';
              }
            })
            .catch(function(){
              document.getElementById('loc-status').textContent = '❌ All location methods failed.';
            });
        } else {
          document.getElementById('loc-status').textContent = '❌ Location blocked. Allow location access in browser.';
        }
      }, { enableHighAccuracy: highAccuracy, timeout: 10000, maximumAge: 10000 });
    }
    
    tryLocation(true);
  }

  // ---- Place autocomplete using TELANGANA_LANDMARKS + GPS Bounded OpenStreetMap ----
  var TELANGANA_LANDMARKS = [
    // Warangal Tri-Cities (Kazipet, Hanamkonda, Warangal)
    { name: 'Kazipet Junction Railway Station', aliases: ['kazipet', 'kazipet station', 'kazipet junction'], lat: 17.9754, lng: 79.5123, type: 'station', detail: 'Kazipet, Telangana' },
    { name: 'Warangal Railway Station', aliases: ['warangal station', 'warangal rly'], lat: 17.9620, lng: 79.6050, type: 'station', detail: 'Warangal Station Rd' },
    { name: 'Hanamkonda Central Bus Stand', aliases: ['hanamkonda bus stand', 'hanamkonda bs', 'bs hanamkonda'], lat: 17.9950, lng: 79.5520, type: 'bus_stop', detail: 'Hanamkonda Bus Station' },
    { name: 'MGM Government Hospital', aliases: ['mgm', 'mgm hospital', 'warangal mgm'], lat: 17.9810, lng: 79.5240, type: 'hospital', detail: 'MGM Hospital Rd, Warangal' },
    { name: 'NIT Warangal (National Institute of Technology)', aliases: ['nit', 'nit warangal', 'nitw'], lat: 17.9840, lng: 79.5310, type: 'school', detail: 'Kazipet Main Rd' },
    { name: 'Kakatiya University (KU)', aliases: ['ku', 'kakatiya university', 'ku cross roads'], lat: 18.0180, lng: 79.5490, type: 'school', detail: 'KU Cross Roads, Hanamkonda' },
    { name: 'Bhadrakali Temple', aliases: ['bhadrakali', 'bhadrakali temple', 'bhadrakali lake'], lat: 17.9870, lng: 79.5780, type: 'temple', detail: 'Bhadrakali Temple Rd' },
    { name: 'Thousand Pillar Temple', aliases: ['thousand pillar', 'veye stambhala gudi'], lat: 17.9940, lng: 79.5740, type: 'temple', detail: 'Hanamkonda' },
    { name: 'Warangal Fort', aliases: ['warangal fort', 'fort warangal', 'kila warangal'], lat: 17.9540, lng: 79.6170, type: 'place', detail: 'Kila Warangal' },
    { name: 'Subedari', aliases: ['subedari', 'subedari hanamkonda', 'subedari water tank'], lat: 17.9930, lng: 79.5480, type: 'place', detail: 'Hanamkonda' },
    { name: 'Naimnagar', aliases: ['naimnagar', 'naim nagar'], lat: 17.9990, lng: 79.5430, type: 'place', detail: 'Hanamkonda' },
    { name: 'Hunter Road', aliases: ['hunter road', 'hunter rd'], lat: 17.9780, lng: 79.5580, type: 'place', detail: 'Hanamkonda' },
    { name: 'Waddepally Lake', aliases: ['waddepally', 'waddepalli', 'waddepally tank'], lat: 17.9880, lng: 79.5390, type: 'place', detail: 'Waddepally, Hanamkonda' },
    { name: 'Chowrasta Hanamkonda', aliases: ['chowrasta', 'hanamkonda chowrasta'], lat: 17.9970, lng: 79.5600, type: 'place', detail: 'Hanamkonda Center' },
    { name: 'Subedari Collectorate', aliases: ['collectorate', 'warangal collectorate'], lat: 17.9910, lng: 79.5460, type: 'place', detail: 'Subedari, Hanamkonda' },

    // Hyderabad & Cyberabad IT Hubs
    { name: 'Rajiv Gandhi International Airport (RGIA)', aliases: ['shamshabad airport', 'rgia', 'hyderabad airport'], lat: 17.2403, lng: 78.4294, type: 'station', detail: 'Shamshabad, Hyderabad' },
    { name: 'Secunderabad Junction Railway Station', aliases: ['secunderabad station', 'secunderabad rly'], lat: 17.4339, lng: 78.5017, type: 'station', detail: 'Secunderabad' },
    { name: 'Hyderabad Deccan Station (Nampally)', aliases: ['nampally station', 'hyderabad station'], lat: 17.3930, lng: 78.4680, type: 'station', detail: 'Nampally, Hyderabad' },
    { name: 'JBS Bus Station (Jubilee Bus Station)', aliases: ['jbs', 'jubilee bus station'], lat: 17.4470, lng: 78.4980, type: 'bus_stop', detail: 'Secunderabad' },
    { name: 'MGBS (Mahatma Gandhi Bus Station)', aliases: ['mgbs', 'imlibun bus stand'], lat: 17.3780, lng: 78.4810, type: 'bus_stop', detail: 'Gowliguda, Hyderabad' },
    { name: 'Hitec City Metro Station / Cyber Towers', aliases: ['hitec city', 'cyber towers', 'hitech city'], lat: 17.4504, lng: 78.3811, type: 'station', detail: 'Madhapur, Hitec City' },
    { name: 'Mindspace IT Park', aliases: ['mindspace', 'mind space raheja'], lat: 17.4435, lng: 78.3770, type: 'place', detail: 'Hitec City, Hyderabad' },
    { name: 'Gachibowli DLF Cybercity', aliases: ['gachibowli', 'dlf gachibowli', 'dlf cybercity'], lat: 17.4490, lng: 78.3610, type: 'place', detail: 'Gachibowli, Hyderabad' },
    { name: 'Charminar', aliases: ['charminar', 'old city charminar'], lat: 17.3616, lng: 78.4747, type: 'place', detail: 'Old City, Hyderabad' },
    { name: 'Ameerpet Metro Station', aliases: ['ameerpet', 'ameerpet metro'], lat: 17.4357, lng: 78.4487, type: 'station', detail: 'Ameerpet, Hyderabad' },
    { name: 'Koti Commercial Center', aliases: ['koti', 'koti market'], lat: 17.3850, lng: 78.4840, type: 'place', detail: 'Koti, Hyderabad' },
    { name: 'Pista House Gachibowli', aliases: ['pista house', 'pista house biryani'], lat: 17.4440, lng: 78.3660, type: 'restaurant', detail: 'Gachibowli, Hyderabad' },
    { name: 'Hotel Bawarchi RTC X Roads', aliases: ['bawarchi', 'bawarchi biryani', 'rtc x roads bawarchi'], lat: 17.4086, lng: 78.4925, type: 'restaurant', detail: 'RTC X Roads, Hyderabad' },
    { name: 'Paradise Biryani Secunderabad', aliases: ['paradise', 'paradise biryani'], lat: 17.4410, lng: 78.4950, type: 'restaurant', detail: 'SD Road, Secunderabad' },
    { name: 'Shah Ghouse Hotel Gachibowli', aliases: ['shah ghouse', 'shah ghouse biryani'], lat: 17.4380, lng: 78.3640, type: 'restaurant', detail: 'Gachibowli, Hyderabad' }
  ];

  (function(){
    var acTimers = {};

    function setupAutocomplete(inputId, suggestionsId, onSelect) {
      var input = document.getElementById(inputId);
      var dropdown = document.getElementById(suggestionsId);
      if (!input || !dropdown) return;

      input.addEventListener('input', function(){
        var rawQ = input.value.trim();
        var q = rawQ.toLowerCase();
        clearTimeout(acTimers[inputId]);
        if (q.length < 2) { dropdown.innerHTML = ''; dropdown.classList.remove('open'); return; }

        // 1. Search TELANGANA_LANDMARKS static dataset first
        var localMatches = TELANGANA_LANDMARKS.filter(function(lm){
          if (lm.name.toLowerCase().includes(q)) return true;
          return lm.aliases.some(function(al){ return al.includes(q); });
        });

        if (localMatches.length > 0) {
          renderSuggestions(localMatches.slice(0, 5).map(function(lm){
            return {
              lat: lm.lat,
              lon: lm.lng,
              name: lm.name,
              display_name: lm.name + ', ' + lm.detail,
              type: lm.type,
              address: { state: 'Telangana' }
            };
          }));
          return;
        }

        dropdown.innerHTML = '<div class="ac-loading">Searching Telangana places...</div>';
        dropdown.classList.add('open');

        // 2. Fetch Nominatim with GPS Bounding Box + Telangana Region Fallback
        acTimers[inputId] = setTimeout(function(){
          var userLat = state.lat || 17.9961;
          var userLng = state.lng || 79.5509;
          
          // Viewbox around user's GPS (approx 30km radius)
          var viewboxStr = (userLng - 0.3) + ',' + (userLat + 0.3) + ',' + (userLng + 0.3) + ',' + (userLat - 0.3);
          var searchUrl = 'https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(rawQ + ', Telangana, India') + '&countrycodes=in&viewbox=' + viewboxStr + '&bounded=0&limit=6&addressdetails=1';

          fetch(searchUrl, {
            headers: { 'Accept-Language': 'en', 'User-Agent': 'RydealotApp/1.0' }
          })
          .then(function(r){ return r.json(); })
          .then(function(results){
            if (!results.length) {
              dropdown.innerHTML = '<div class="ac-loading">No places found. Tap map above to set exact pin 📍</div>';
              return;
            }
            renderSuggestions(results);
          })
          .catch(function(){
            dropdown.innerHTML = '<div class="ac-loading">Search failed. Tap map above to set exact pin 📍</div>';
          });
        }, 300);

        function renderSuggestions(results) {
          dropdown.innerHTML = results.map(function(place){
            var addr = place.address || {};
            var name = place.name || addr.road || addr.neighbourhood || place.display_name.split(',')[0];
            var detail = [addr.suburb||addr.neighbourhood||addr.village, addr.city||addr.town||addr.county, addr.state].filter(Boolean).join(', ');
            var type = place.type || place.class || 'place';
            var icon = type === 'bus_stop' ? '🚌' : type === 'railway_station' || type === 'station' ? '🚆' : type === 'hospital' ? '🏥' : type === 'school' || type === 'college' ? '🏫' : type === 'hotel' ? '🏨' : type === 'restaurant' || type === 'cafe' ? '🍽️' : '📍';
            return '<div class="ac-item" data-lat="' + place.lat + '" data-lng="' + (place.lon || place.lng) + '" data-name="' + (name||'').replace(/"/g,'&quot;') + '" data-display="' + place.display_name.replace(/"/g,'&quot;') + '">' +
              '<div class="ac-icon">' + icon + '</div>' +
              '<div><div class="ac-name">' + name + '</div><div class="ac-addr">' + (detail || place.display_name.split(',').slice(1,3).join(',').trim()) + '</div></div>' +
            '</div>';
          }).join('');
          
          dropdown.classList.add('open');

          Array.prototype.forEach.call(dropdown.querySelectorAll('.ac-item'), function(item){
            item.addEventListener('mousedown', function(e){
              e.preventDefault();
              var selectedName = item.getAttribute('data-name');
              var displayName = item.getAttribute('data-display');
              input.value = selectedName;
              dropdown.innerHTML = '';
              dropdown.classList.remove('open');
              if(onSelect) onSelect(parseFloat(item.getAttribute('data-lat')), parseFloat(item.getAttribute('data-lng')), selectedName, displayName);
            });
          });
        }
      });

      document.addEventListener('click', function(e){
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
          dropdown.classList.remove('open');
        }
      });

      input.addEventListener('focus', function(){
        if (dropdown.innerHTML && dropdown.querySelectorAll('.ac-item').length) {
          dropdown.classList.add('open');
        }
      });
    }

    // Pickup: fills coordinates and updates setup map
    setupAutocomplete('pickup-input', 'pickup-suggestions', function(lat, lng){
      state.lat = lat;
      state.lng = lng;
      updateSetupMapMarkers();
    });

    var useCurrentLocBtn = document.getElementById('btn-use-current-loc');
    if (useCurrentLocBtn) {
      useCurrentLocBtn.addEventListener('click', function(){
        useCurrentLocBtn.style.opacity = '0.6';
        useCurrentLocBtn.textContent = '⌛ Detecting...';
        navigator.geolocation.getCurrentPosition(function(pos){
          var lat = pos.coords.latitude;
          var lng = pos.coords.longitude;
          state.lat = lat;
          state.lng = lng;
          updateSetupMapMarkers();
          document.getElementById('pickup-input').value = 'Current Location (GPS)';
          toast('📍 Pickup set to Current Location (GPS)');
          useCurrentLocBtn.style.opacity = '1';
          useCurrentLocBtn.textContent = '📍 Current location';
        }, function(err){
          useCurrentLocBtn.style.opacity = '1';
          useCurrentLocBtn.textContent = '📍 Current location';
          if (state.lat && state.lng) {
            document.getElementById('pickup-input').value = 'Current Location (GPS)';
            toast('📍 Pickup set to Current Location (GPS)');
          } else {
            toast('❌ Could not get GPS location. Enable Location in browser.');
          }
        }, { enableHighAccuracy: true, timeout: 10000 });
      });
    }

    // Drop: fills coordinates, label, and updates setup map
    setupAutocomplete('drop-input', 'drop-suggestions', function(lat, lng){
      state.destLat = lat;
      state.destLng = lng;
      updateSetupMapMarkers();
      updateTripDistanceAndFares();
    });
  })();

  document.getElementById('login-btn').addEventListener('click', async function(){
    var name = document.getElementById('login-name').value.trim();
    var pickup = document.getElementById('pickup-input').value.trim();
    var drop = document.getElementById('drop-input').value.trim();
    if(!name){
      toast('Please enter your name');
      return;
    }
    if(!state.lat || !state.lng){
      toast('Please wait for location to load, or select Test Location.');
      return;
    }
    state.userName = name;
    state.pickup = pickup || 'Current Location';
    state.drop = drop || 'Destination';

    // Auto-index new customer landmarks into dataset & Supabase map_places
    autoSaveCustomerLandmark(state.drop, state.destLat || state.lat, state.destLng || state.lng);
    autoSaveCustomerLandmark(state.pickup, state.lat, state.lng);

    // Calculate real street route distance & fares dynamically
    await updateTripDistanceAndFares();

    document.getElementById('lot-title').textContent = state.pickup + ' \u2192 ' + state.drop;
    document.getElementById('lot-place-name').textContent = state.pickup;
    if (state.lat && state.lng) {
      document.getElementById('lot-coords-display').textContent = 'GPS Active: ' + state.lat.toFixed(5) + ', ' + state.lng.toFixed(5);
      document.getElementById('lot-coords-display-container').style.display = 'flex';
    } else {
      document.getElementById('lot-coords-display-container').style.display = 'none';
    }
    try {
      localStorage.setItem('rydealot_last_search', JSON.stringify({
        pickup: state.pickup,
        drop: state.drop
      }));
    } catch(e) {}
    saveLotState();
    showScreen('screen-lot');
    resetLot();
  });

  function highlightVehiclesInLot(type) {
    if (!svg) return;
    var slots = svg.querySelectorAll('.slot-wrap');
    Array.prototype.forEach.call(slots, function(slotEl) {
      var sId = slotEl.getAttribute('data-slot');
      var sType = slotType && slotType[sId];
      if (sType === type) {
        slotEl.classList.add('lot-highlight');
        slotEl.style.opacity = '1';
      } else {
        slotEl.classList.remove('lot-highlight');
        slotEl.style.opacity = '0.35';
      }
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.ride-type-card'), function(card){
    card.addEventListener('click', function(){
      var type = card.getAttribute('data-type');
      state.selectedRideType = type;

      Array.prototype.forEach.call(document.querySelectorAll('.ride-type-card'), function(c){
        var isTarget = (c === card);
        c.classList.toggle('selected', isTarget);
        c.classList.remove('card-just-selected');
        var icon = c.querySelector('.rt-icon');
        if (icon) icon.classList.remove('anim-vehicle-bounce');
      });

      card.classList.add('card-just-selected');
      setTimeout(function() { card.classList.remove('card-just-selected'); }, 400);

      var icon = card.querySelector('.rt-icon');
      if (icon) {
        void icon.offsetWidth; // trigger reflow
        icon.classList.add('anim-vehicle-bounce');
      }

      highlightVehiclesInLot(type);
      updateBookButton();
      saveLotState();
    });
  });

  document.getElementById('lot-back').addEventListener('click', function(){
    clearInterval(pollTimer);
    clearLotState();
    showScreen('screen-login');
  });

  function getUserIdentifier() {
    if (typeof authState !== 'undefined' && authState.currentUser) {
      return (authState.currentUser.phone || authState.currentUser.email || 'user_guest').replace(/[^a-zA-Z0-9]/g, '_');
    }
    var deviceId = localStorage.getItem('rydealot_device_uuid');
    if (!deviceId) {
      deviceId = 'dev_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('rydealot_device_uuid', deviceId);
    }
    return deviceId;
  }

  function getUsedCouponsForUser() {
    var uid = getUserIdentifier();
    var stored = localStorage.getItem('rydealot_used_coupons_' + uid);
    return stored ? JSON.parse(stored) : [];
  }

  function markCouponUsedForUser(code) {
    if (!code) return;
    var uid = getUserIdentifier();
    var usedList = getUsedCouponsForUser();
    if (!usedList.includes(code)) {
      usedList.push(code);
      localStorage.setItem('rydealot_used_coupons_' + uid, JSON.stringify(usedList));
    }
  }

  // ===== REFER & EARN ENGINE =====
  function getUserReferralCode() {
    var uid = getUserIdentifier();
    var key = 'rydealot_ref_code_' + uid;
    var code = localStorage.getItem(key);
    if (!code) {
      var hash = Math.random().toString(36).substr(2, 5).toUpperCase();
      code = 'RYDE-' + hash;
      localStorage.setItem(key, code);
    }
    return code;
  }

  window.copyUserRefCode = function() {
    var code = getUserReferralCode();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code);
      toast('📋 Referral Code ' + code + ' copied to clipboard!');
    } else {
      toast('Your Code: ' + code);
    }
  };

  window.shareRefOnWhatsApp = function() {
    var code = getUserReferralCode();
    var text = encodeURIComponent('🎉 Join me on Rydealot Bike Taxi & Auto! Use my referral code *' + code + '* to get ₹30 OFF your ride! Download & ride: https://rydealot.vercel.app');
    window.open('https://api.whatsapp.com/send?text=' + text, '_blank');
  };

  window.claimFriendRefCode = function() {
    var input = document.getElementById('input-friend-ref-code');
    var msg = document.getElementById('ref-status-msg');
    var code = (input.value || '').trim().toUpperCase();
    var myCode = getUserReferralCode();

    if (!code) {
      msg.style.display = 'block';
      msg.style.color = 'var(--red)';
      msg.textContent = 'Enter a valid friend referral code';
      return;
    }

    if (code === myCode) {
      msg.style.display = 'block';
      msg.style.color = 'var(--red)';
      msg.textContent = '❌ You cannot claim your own referral code!';
      return;
    }

    var uid = getUserIdentifier();
    var claimedKey = 'rydealot_claimed_ref_' + uid;
    if (localStorage.getItem(claimedKey)) {
      msg.style.display = 'block';
      msg.style.color = 'var(--red)';
      msg.textContent = '❌ You have already claimed a friend referral bonus!';
      return;
    }

    var refCfg = JSON.parse(localStorage.getItem('rydealot_referral_config') || '{"inviter":50,"friend":30}');
    var friendReward = refCfg.friend || 30;

    localStorage.setItem(claimedKey, code);
    
    // Grant current user ₹30 Welcome Bonus
    var unlockedCount = parseInt(localStorage.getItem('rydealot_unlocked_rides_' + uid) || '0') + 1;
    localStorage.setItem('rydealot_unlocked_rides_' + uid, unlockedCount);

    // Save referral entry to admin referrals table
    var adminRefs = JSON.parse(localStorage.getItem('rydealot_admin_referrals') || '[]');
    var existingInviter = adminRefs.find(function(r){ return r.code === code; });
    if (existingInviter) {
      existingInviter.friends = (existingInviter.friends || 0) + 1;
      existingInviter.unlocked = (existingInviter.unlocked || 0) + 1;
    } else {
      adminRefs.push({ user: 'User (' + code + ')', code: code, friends: 1, unlocked: 1, totalVal: refCfg.inviter || 50 });
    }
    localStorage.setItem('rydealot_admin_referrals', JSON.stringify(adminRefs));

    msg.style.display = 'block';
    msg.style.color = 'var(--green)';
    msg.textContent = '🎉 Bonus Claimed! You unlocked ₹' + friendReward + ' OFF your next ride!';

    var promoInput = document.getElementById('input-promo-code');
    if (promoInput) promoInput.value = 'REFER50';
    var applyBtn = document.getElementById('btn-apply-promo');
    if (applyBtn) applyBtn.click();

    updateReferralCardUI();
  };

  function updateReferralCardUI() {
    var displayEl = document.getElementById('user-ref-code-display');
    if (displayEl) displayEl.textContent = getUserReferralCode();
    
    var uid = getUserIdentifier();
    var count = parseInt(localStorage.getItem('rydealot_unlocked_rides_' + uid) || '0');
    var badge = document.getElementById('user-unlocked-coupons-badge');
    if (badge) badge.textContent = count > 0 ? ('🎉 ' + count + ' Ride' + (count>1?'s':'') + ' Unlocked!') : '0 Unlocked';
  }

  // ===== INSIDE-WEBSITE MODAL HANDLERS =====
  window.openInsufficientBalModal = function(curBal, reqPrice, passName) {
    var modal = document.getElementById('rd-insufficient-bal-modal');
    var desc = document.getElementById('insufficient-bal-desc');
    if (desc) desc.textContent = 'Your current wallet balance is ₹' + curBal + '. You need ₹' + reqPrice + ' to activate ' + passName + '.';
    if (modal) modal.style.display = 'flex';
  };

  window.closeInsufficientBalModal = function() {
    var modal = document.getElementById('rd-insufficient-bal-modal');
    if (modal) modal.style.display = 'none';
  };

  window.promptRazorpayRecharge = function() {
    var modal = document.getElementById('rd-rzp-amount-modal');
    if (modal) modal.style.display = 'flex';
  };

  window.closeRzpAmountModal = function() {
    var modal = document.getElementById('rd-rzp-amount-modal');
    if (modal) modal.style.display = 'none';
  };

  window.selectRzpChipAmount = function(amt) {
    var inp = document.getElementById('input-rzp-custom-amount');
    if (inp) inp.value = amt;
  };

  window.proceedRzpPayment = function() {
    var inp = document.getElementById('input-rzp-custom-amount');
    var amt = parseFloat(inp ? inp.value : 100);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid recharge amount');
      return;
    }
    closeRzpAmountModal();
    startRazorpayRecharge(amt);
  };

  function startRazorpayRecharge(amount) {
    var commCfg = JSON.parse(localStorage.getItem('rydealot_comm_config') || '{}');
    var rzpKey = commCfg.rzpKey || 'rzp_test_TP8cQcN108C2KZ';
    
    if (typeof Razorpay === 'undefined') {
      alert('Razorpay Payment Gateway loading... Please check internet connection and try again.');
      return;
    }

    var uid = getUserIdentifier();
    var driverName = (document.getElementById('rd-rider-name') ? document.getElementById('rd-rider-name').value : '') || 'Driver (' + uid + ')';
    var driverPhone = (document.getElementById('rd-rider-phone') ? document.getElementById('rd-rider-phone').value : '') || '';

    var options = {
      "key": rzpKey,
      "amount": Math.round(amount * 100),
      "currency": "INR",
      "name": "Rydealot Driver Wallet",
      "description": "Instant Driver Wallet Top-Up (₹" + amount + ")",
      "config": {
        "display": {
          "blocks": {
            "utib": {
              "name": "Pay via UPI (GPay, PhonePe, Paytm, QR)",
              "instruments": [
                {
                  "method": "upi"
                }
              ]
            }
          },
          "sequence": ["block.utib"]
        }
      },
      "handler": function (response){
        var curBal = parseFloat(localStorage.getItem('rydealot_driver_wallet_balance') || '0');
        var newBal = curBal + amount;
        localStorage.setItem('rydealot_driver_wallet_balance', newBal);
        
        var adminRecharges = JSON.parse(localStorage.getItem('rydealot_upi_recharges') || '[]');
        adminRecharges.unshift({
          driver: driverName + (driverPhone ? ' (' + driverPhone + ')' : ''),
          amount: amount,
          utr: response.razorpay_payment_id || ('RZP_' + Math.random().toString(36).substr(2,7).toUpperCase()),
          time: 'Just now (Instant Razorpay PG)',
          status: 'approved'
        });
        localStorage.setItem('rydealot_upi_recharges', JSON.stringify(adminRecharges));

        var balDisplay = document.getElementById('rd-wallet-balance-display');
        if (balDisplay) balDisplay.textContent = '₹' + newBal;

        toast('🎉 Instant Auto-Recharge Successful! ₹' + amount + ' credited to your wallet!');
      },
      "prefill": {
        "name": driverName,
        "contact": driverPhone,
        "method": "upi"
      },
      "theme": {
        "color": "#1d9e75"
      }
    };

    try {
      var rzp = new Razorpay(options);
      rzp.open();
    } catch(err) {
      alert('Could not launch Razorpay checkout: ' + err.message);
    }
  }

  // ===== DRIVER REAL MONEY UPI RECHARGE MODAL =====
  window.openUpiRechargeModal = function() {
    var commCfg = JSON.parse(localStorage.getItem('rydealot_comm_config') || '{"upiId":"rydealot@upi"}');
    var upiId = commCfg.upiId || 'rydealot@upi';
    var uid = getUserIdentifier();
    var driverRefId = 'RD-' + uid;
    var upiUri = 'upi://pay?pa=' + encodeURIComponent(upiId) + '&pn=Rydealot&tr=' + encodeURIComponent(driverRefId) + '&cu=INR';

    var upiQrImg = document.getElementById('rd-upi-qr-img');
    if (upiQrImg) upiQrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(upiUri);
    var displayUpiId = document.getElementById('rd-display-upi-id');
    if (displayUpiId) displayUpiId.textContent = 'UPI ID: ' + upiId + ' (Ref: ' + driverRefId + ')';

    var modal = document.getElementById('rd-upi-recharge-modal');
    if (modal) modal.style.display = 'flex';
  };

  window.closeUpiRechargeModal = function() {
    var modal = document.getElementById('rd-upi-recharge-modal');
    if (modal) modal.style.display = 'none';
  };

  window.submitUpiRechargeRequest = function() {
    var amount = parseFloat(document.getElementById('input-upi-amount').value || 0);
    var utr = (document.getElementById('input-upi-utr').value || '').trim().toUpperCase();
    var msg = document.getElementById('upi-submit-msg');

    if (amount <= 0 || !utr) {
      msg.style.display = 'block';
      msg.style.color = 'var(--red)';
      msg.textContent = 'Please enter valid recharge amount and UTR Transaction ID';
      return;
    }

    var uid = getUserIdentifier();
    var driverName = (document.getElementById('rd-rider-name') ? document.getElementById('rd-rider-name').value : '') || 'Driver (' + uid + ')';

    var payload = {
      driver: driverName,
      amount: amount,
      utr: utr,
      time: 'Just now',
      status: 'pending',
      timestamp: Date.now()
    };

    var list = JSON.parse(localStorage.getItem('rydealot_upi_recharges') || '[]');
    list.unshift(payload);
    localStorage.setItem('rydealot_upi_recharges', JSON.stringify(list));

    msg.style.display = 'block';
    msg.style.color = 'var(--green)';
    msg.textContent = '✅ Payment submitted! Admin will verify UTR and credit ₹' + amount + ' to your wallet.';

    setTimeout(function() {
      closeUpiRechargeModal();
      document.getElementById('input-upi-utr').value = '';
      if (msg) msg.style.display = 'none';
    }, 2000);
  };

  // ===== SUBSCRIPTION PASS EXPIRY TIMER ENGINE =====
  function updateDriverPassTimerUI() {
    var timerCard = document.getElementById('rd-active-pass-timer-card');
    var titleEl = document.getElementById('rd-active-plan-title');
    var countdownEl = document.getElementById('rd-active-pass-countdown');
    if (!timerCard) return;

    var plan = localStorage.getItem('rydealot_driver_active_plan');
    var expiryStr = localStorage.getItem('rydealot_driver_pass_expiry');
    var expiryTime = expiryStr ? parseInt(expiryStr) : 0;

    if (plan === 'commission') {
      timerCard.style.display = 'flex';
      titleEl.textContent = '🚗 Per-Ride Commission Mode';
      countdownEl.textContent = 'Fixed ₹25 / Trip';
      return;
    }

    if (!plan || !expiryTime) {
      timerCard.style.display = 'none';
      return;
    }

    var now = Date.now();
    var diffMs = expiryTime - now;

    if (diffMs <= 0) {
      // EXPIRED: Auto-stop subscription pass
      localStorage.removeItem('rydealot_driver_active_plan');
      localStorage.removeItem('rydealot_driver_pass_expiry');
      timerCard.style.display = 'flex';
      titleEl.textContent = '⚠️ Subscription Pass Expired';
      countdownEl.textContent = 'Select Plan to Go Online';
      toast('⚠️ Driver Subscription Pass expired! Please activate a new pass to go online.');
      return;
    }

    var totalSec = Math.floor(diffMs / 1000);
    var hrs = Math.floor(totalSec / 3600);
    var mins = Math.floor((totalSec % 3600) / 60);
    var secs = totalSec % 60;

    var passTitle = plan === 'weekly' ? '🌟 Weekly Pass (0% Commission)' : '🗓️ Daily Pass (0% Commission)';
    timerCard.style.display = 'flex';
    titleEl.textContent = passTitle;
    countdownEl.textContent = (hrs > 0 ? hrs + 'h ' : '') + mins + 'm ' + secs + 's';
  }

  setInterval(updateDriverPassTimerUI, 1000);

  function updateDriverIncentivesUI() {
    var container = document.getElementById('rd-bonus-schemes-list');
    if (!container) return;
    var list = JSON.parse(localStorage.getItem('rydealot_admin_bonuses') || '[]');
    if (!list.length) {
      list = [
        { title: '5 Rides Daily Sprint', rides: 5, reward: 15 },
        { title: 'Driver Buddy Referral', rides: 1, reward: 50 }
      ];
    }
    container.innerHTML = list.map(function(b) {
      return '<div style="display:flex; align-items:center; justify-content:space-between; background:var(--card); padding:8px 10px; border-radius:8px; border:1px solid var(--border);">' +
        '<span>🌟 <strong>' + b.title + ':</strong> ' + (b.rides > 1 ? ('Complete ' + b.rides + ' rides') : 'Per referral') + '</span>' +
        '<span style="color:#1d9e75; font-weight:800;">+ ₹' + b.reward + ' Bonus</span>' +
      '</div>';
    }).join('');
  }

  var btnApplyPromo = document.getElementById('btn-apply-promo');
  if (btnApplyPromo) {
    btnApplyPromo.addEventListener('click', async function(){
      var input = document.getElementById('input-promo-code');
      var msg = document.getElementById('promo-status-msg');
      var code = (input.value || '').trim().toUpperCase();

      if (!code) {
        msg.style.display = 'block';
        msg.style.color = 'var(--red)';
        msg.textContent = 'Enter a valid coupon code';
        return;
      }

      msg.style.display = 'block';
      msg.style.color = 'var(--text-mute)';
      msg.textContent = 'Verifying coupon code...';

      // SINGLE-USE CHECK: Check if customer has already used this coupon code
      var usedCoupons = getUsedCouponsForUser();
      if (usedCoupons.includes(code)) {
        msg.style.color = 'var(--red)';
        msg.textContent = '❌ You have already redeemed coupon';
        appliedPromoCode = null;
        appliedPromoDiscountVal = 0;
        refreshSurgeAndFares();
        updateBookButton();
        return;
      }

      var validCoupon = null;
      try {
        var remoteCoupons = await sbFetch('map_coupons?code=eq.' + encodeURIComponent(code) + '&status=eq.active');
        if (remoteCoupons && remoteCoupons.length > 0) validCoupon = remoteCoupons[0];
      } catch(e) {}

      if (!validCoupon) {
        var localCoupons = JSON.parse(localStorage.getItem('rydealot_admin_coupons') || '[]');
        validCoupon = localCoupons.find(function(c){ return c.code === code && c.status === 'active'; });
      }

      if (!validCoupon) {
        if (code === 'FIRST3') validCoupon = { code:'FIRST3', type:'percentage', value:50, max_cap:30 };
        else if (code === 'WARANGAL') validCoupon = { code:'WARANGAL', type:'flat', value:10 };
        else if (code === 'STUDENT' || code === 'NITW') validCoupon = { code:'STUDENT', type:'flat', value:15 };
        else if (code === 'REFER' || code === 'REFERRAL' || code === 'REFER50') validCoupon = { code:'REFER50', type:'flat', value:50 };
      }

      if (validCoupon) {
        appliedPromoCode = validCoupon.code;
        appliedPromoType = validCoupon.type;
        appliedPromoDiscountVal = validCoupon.value;
        appliedPromoMaxCap = validCoupon.max_cap || 0;

        msg.style.color = 'var(--green)';
        var label = validCoupon.type === 'percentage' ? validCoupon.value + '% Off' + (validCoupon.max_cap ? ' (Max ₹' + validCoupon.max_cap + ')' : '') : 'Flat ₹' + validCoupon.value + ' Off';
        msg.textContent = '🎉 Coupon ' + validCoupon.code + ' applied! ' + label;
      } else {
        appliedPromoCode = null;
        appliedPromoDiscountVal = 0;
        msg.style.color = 'var(--red)';
        msg.textContent = '❌ Invalid or expired coupon code!';
      }

      refreshSurgeAndFares();
      updateBookButton();
    });
  }

  // ---------------- parking lot (vehicle icons + booking) ----------------

  function bikeMarkup(id, colorBody, colorAccent){
    return (
      '<g class="vehicle-shape" data-id="'+id+'" data-type="bike" tabindex="0" role="button" aria-label="Bike, tap for rider details">' +
        '<rect x="-6.5" y="20" width="13" height="22" rx="5" fill="#202225"/>' +
        '<rect x="-5" y="21.5" width="10" height="19" rx="4" fill="#3a3d42"/>' +
        '<rect x="-9" y="-4" width="18" height="28" rx="7" fill="'+colorBody+'"/>' +
        '<ellipse cx="0" cy="-14" rx="8.5" ry="11" fill="'+colorBody+'"/>' +
        '<ellipse cx="0" cy="-15" rx="5.5" ry="7" fill="rgba(255,255,255,0.25)"/>' +
        '<rect x="-13" y="-26" width="26" height="5.5" rx="2.5" fill="'+colorAccent+'"/>' +
        '<rect x="-1.6" y="-28" width="3.2" height="10" rx="1.4" fill="'+colorAccent+'"/>' +
        '<rect x="-6.5" y="-36" width="13" height="14" rx="4.5" fill="#202225"/>' +
        '<rect x="-5" y="-34.5" width="10" height="11" rx="3.5" fill="#3a3d42"/>' +
      '</g>'
    );
  }

  function carMarkup(id, colorBody, colorGlass){
    return (
      '<g class="vehicle-shape" data-id="'+id+'" data-type="car" tabindex="0" role="button" aria-label="Car, tap for rider details">' +
        '<rect x="-22" y="-44" width="44" height="88" rx="13" fill="#2b2e33"/>' +
        '<rect x="-19.5" y="-41" width="39" height="82" rx="11" fill="'+colorBody+'"/>' +
        '<rect x="-15" y="-30" width="30" height="22" rx="5" fill="'+colorGlass+'" opacity="0.85"/>' +
        '<rect x="-15" y="9" width="30" height="20" rx="5" fill="'+colorGlass+'" opacity="0.85"/>' +
        '<rect x="-22.5" y="-14" width="4" height="11" rx="2" fill="#1c1e21"/>' +
        '<rect x="18.5" y="-14" width="4" height="11" rx="2" fill="#1c1e21"/>' +
        '<line x1="-19.5" y1="0" x2="19.5" y2="0" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>' +
      '</g>'
    );
  }

  function autoMarkup(id, colorBody){
    return (
      '<g class="vehicle-shape" data-id="'+id+'" data-type="auto" tabindex="0" role="button" aria-label="Auto rickshaw, tap for rider details">' +
        '<rect x="-15" y="14" width="11" height="16" rx="4" fill="#202225"/>' +
        '<rect x="4" y="14" width="11" height="16" rx="4" fill="#202225"/>' +
        '<rect x="-13" y="16" width="9" height="11" rx="3" fill="#3a3d42"/>' +
        '<rect x="6" y="16" width="9" height="11" rx="3" fill="#3a3d42"/>' +
        '<path d="M-17 18 L-17 -10 A17 17 0 0117 -10 L17 18 Z" fill="'+colorBody+'"/>' +
        '<rect x="-13" y="-6" width="26" height="20" rx="4" fill="rgba(255,255,255,0.3)"/>' +
        '<rect x="-3" y="-24" width="6" height="16" rx="2.5" fill="#202225"/>' +
        '<rect x="-15" y="-28" width="30" height="6" rx="3" fill="'+colorBody+'"/>' +
        '<circle cx="0" cy="-30" r="3" fill="'+colorBody+'"/>' +
      '</g>'
    );
  }

  var bikePalette = [
    { body:'#1f6fb0', accent:'#16181c' },
    { body:'#1d9e75', accent:'#16181c' },
    { body:'#c97a17', accent:'#16181c' },
    { body:'#d23c3c', accent:'#16181c' }
  ];
  var carPalette = [
    { body:'#3c3489', glass:'#aab4c2' },
    { body:'#16181c', glass:'#aab4c2' },
    { body:'#9a3b3b', glass:'#aab4c2' },
    { body:'#1f5f8b', glass:'#aab4c2' }
  ];
  var autoPalette = [
    { body:'#c9a227' },
    { body:'#3c8f5c' },
    { body:'#1f6fb0' },
    { body:'#9a3b3b' }
  ];

  // Two facing rows across a center aisle — bikes, autos, and cars can all
  // park in any slot in either row. Each slot just holds a position; the
  // vehicle type living there is decided when that slot gets filled.
  var slotXs = [40, 100, 160, 220, 280, 340];
  var topY = 76;
  var bottomY = 184;
  var REST_ROT = 0; // set per-row at render time (top row faces down, bottom row faces up)

  // Slots only hold a position + which row they're in. Each slot is filled
  // with a REAL rider fetched from Supabase, not fake data — if more riders
  // are online than there are slots, only the closest ones shown here are
  // displayed; the rest still exist and can be found by widening search.
  var slotDefs = [];
  slotXs.forEach(function(x, i){ slotDefs.push({ id:'top'+i, x:x, y:topY, row:'top' }); });
  slotXs.forEach(function(x, i){ slotDefs.push({ id:'bot'+i, x:x, y:bottomY, row:'bottom' }); });

  var present, riderAssign, slotType, pollTimer;
  var svg = document.getElementById('lot-svg');

  function haversineKm(lat1, lon1, lat2, lon2){
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  // Pulls real available riders from Supabase, sorts by real distance from
  // the user, and maps the closest ones onto the slot grid for display.
  function withTimeout(promise, ms){
    return Promise.race([
      promise,
      new Promise(function(_, reject){
        setTimeout(function(){ reject(new Error('Request timed out')); }, ms);
      })
    ]);
  }

  async function fetchRealRiders(){
    try{
      var rows = await withTimeout(sbFetch('riders?status=eq.available'), 8000);
      var ninetySecondsAgo = new Date(Date.now() - 90 * 1000);
      var nearbyInZone = [];
      var expandedZone = [];

      (rows || []).forEach(function(r){
        if (r.lat == null || r.lng == null) return;
        if (r.updated_at) {
          var updatedAt = new Date(r.updated_at);
          if (updatedAt < ninetySecondsAgo) return;
        }
        r._distanceKm = (state.lat != null) ? haversineKm(state.lat, state.lng, r.lat, r.lng) : 99999.0;
        
        if (r._distanceKm <= 5.0) {
          nearbyInZone.push(r);
        } else if (r._distanceKm <= 12.0) {
          expandedZone.push(r);
        }
      });

      nearbyInZone.sort(function(a, b){ return a._distanceKm - b._distanceKm; });
      expandedZone.sort(function(a, b){ return a._distanceKm - b._distanceKm; });

      var countLabel = document.getElementById('count-label');
      var bonusBanner = document.getElementById('bonus-banner');
      var bonusText = document.getElementById('bonus-text');

      if (nearbyInZone.length > 0) {
        if (countLabel) countLabel.textContent = nearbyInZone.length + ' drivers in 5 km zone (ETA < 6 mins)';
        if (bonusBanner) bonusBanner.style.display = 'none';
        return nearbyInZone;
      } else if (expandedZone.length > 0) {
        // Remote / temple area expansion
        if (countLabel) countLabel.textContent = expandedZone.length + ' drivers in extended zone (' + expandedZone[0]._distanceKm.toFixed(1) + ' km away)';
        if (bonusBanner) {
          bonusBanner.style.display = 'flex';
          if (bonusText) bonusText.textContent = 'Remote area detected. Matched nearest driver ' + expandedZone[0]._distanceKm.toFixed(1) + ' km away with transparent upfront pickup allowance.';
        }
        return expandedZone;
      } else {
        if (countLabel) countLabel.textContent = '0 drivers active nearby';
        if (bonusBanner) {
          bonusBanner.style.display = 'flex';
          if (bonusText) bonusText.textContent = 'No drivers active within 12 km. Searching nearby highway corridors...';
        }
        return [];
      }
    } catch(err){
      console.error('fetch riders failed', err);
      toast('Could not load nearby riders: ' + err.message);
      return [];
    }
  }

  function mapRidersOntoSlots(riders){
    present = {};
    riderAssign = {};
    slotType = {};
    slotDefs.forEach(function(s, i){
      var r = riders[i];
      if(r){
        present[s.id] = true;
        slotType[s.id] = r.vehicle_type;
        riderAssign[s.id] = {
          dbId: r.id,
          name: r.name,
          initials: (r.name || '?').trim().split(/\s+/).map(function(p){ return p[0]; }).slice(0,2).join('').toUpperCase(),
          vehicleLabel: r.vehicle_label,
          plate: r.plate,
          distance: r._distanceKm.toFixed(1) + ' km',
          eta: Math.max(1, Math.round(r._distanceKm * 4)) + ' min'
        };
      } else {
        present[s.id] = false;
      }
    });
  }

  async function resetLot(){
    var riders = await fetchRealRiders();
    state.realRiderCount = riders.length;
    mapRidersOntoSlots(riders);
    document.getElementById('bonus-banner').classList.remove('show');
    document.getElementById('book-btn').disabled = false;
    document.getElementById('book-btn').style.opacity = '1';
    render();
    updateStatus();
    refreshSurgeAndFares();
    clearInterval(pollTimer);
    pollTimer = setInterval(async function(){
      var freshRiders = await fetchRealRiders();
      state.realRiderCount = freshRiders.length;

      // Detect vehicles booked by other passengers or gone offline
      var freshDbIds = freshRiders.map(function(r){ return r.id; });
      var departingSlots = [];
      if (riderAssign) {
        Object.keys(riderAssign).forEach(function(slotId){
          var prevRider = riderAssign[slotId];
          if (prevRider && prevRider.dbId && freshDbIds.indexOf(prevRider.dbId) === -1 && present && present[slotId]) {
            departingSlots.push(slotId);
          }
        });
      }

      if (departingSlots.length > 0) {
        departingSlots.forEach(function(slotId){
          removeVehicle(slotId, function(){
            mapRidersOntoSlots(freshRiders);
            render();
            updateStatus();
            refreshSurgeAndFares();
          });
        });
      } else {
        mapRidersOntoSlots(freshRiders);
        render();
        updateStatus();
        refreshSurgeAndFares();
      }
    }, 4000);
  }

  function paletteFor(slotId, type){
    var idx = parseInt(slotId.replace(/\D/g,''), 10) || 0;
    if(type === 'bike') return bikePalette[idx % bikePalette.length];
    if(type === 'auto' || type === 'auto_share') return autoPalette[idx % autoPalette.length];
    return carPalette[idx % carPalette.length];
  }

  function drawLotFrame(){
    var bg = '';
    var dividerXs = [20, 70, 130, 190, 250, 310, 370];
    dividerXs.forEach(function(x){
      bg += '<line x1="'+x+'" y1="40" x2="'+x+'" y2="112" stroke="#6a6e74" stroke-width="2" stroke-dasharray="6 6" opacity="0.5"/>';
    });
    dividerXs.forEach(function(x){
      bg += '<line x1="'+x+'" y1="148" x2="'+x+'" y2="220" stroke="#6a6e74" stroke-width="2" stroke-dasharray="6 6" opacity="0.5"/>';
    });
    bg += '<line x1="10" y1="130" x2="390" y2="130" stroke="#f4f4f4" stroke-width="2" stroke-dasharray="10 8" opacity="0.5"/>';
    return bg;
  }

  function render(){
    var html = drawLotFrame();
    slotDefs.forEach(function(s){
      if(present[s.id]){
        var type = slotType[s.id];
        var rotation = s.row === 'top' ? 180 : 0;
        var pal = paletteFor(s.id, type);
        var inner = type === 'bike' ? bikeMarkup(s.id, pal.body, pal.accent)
                  : (type === 'auto' || type === 'auto_share') ? autoMarkup(s.id, pal.body)
                  : carMarkup(s.id, pal.body, pal.glass);
        html += '<g transform="translate('+s.x+','+s.y+') rotate('+rotation+')" class="slot-wrap" data-slot="'+s.id+'" data-x="'+s.x+'" data-y="'+s.y+'" data-rot="'+rotation+'" style="opacity:1;">' + inner + '</g>';
      }
    });
    svg.innerHTML = html;

    Array.prototype.forEach.call(svg.querySelectorAll('.vehicle-shape'), function(el){
      el.addEventListener('click', function(){
        openDetail(el.getAttribute('data-id'));
      });
      el.addEventListener('keydown', function(e){
        if(e.key === 'Enter' || e.key === ' '){ openDetail(el.getAttribute('data-id')); }
      });
    });

    highlightVehiclesInLot(state.selectedRideType || 'bike');
  }

  function countPresent(){
    if(!present) return 0;
    return Object.keys(present).filter(function(k){ return present[k]; }).length;
  }

  // ===== DYNAMIC ADMIN FARE ENGINE =====
  var FARE_CONFIG = {
    bike: { base: 25, perKm: 7 },
    auto: { base: 35, perKm: 12 },
    auto_share: { base: 20, perKm: 6 },
    car: { base: 60, perKm: 16 },
    surgeMode: 'auto',
    manualSurge: 1.0,
    nightSurge: 1.2
  };

  async function loadFareConfig(){
    try {
      var saved = localStorage.getItem('rydealot_fare_config');
      if(saved){
        var parsed = JSON.parse(saved);
        if(parsed.bike) FARE_CONFIG.bike = parsed.bike;
        if(parsed.auto) FARE_CONFIG.auto = parsed.auto;
        if(parsed.auto_share) FARE_CONFIG.auto_share = parsed.auto_share;
        if(parsed.car) FARE_CONFIG.car = parsed.car;
        if(parsed.surgeMode) FARE_CONFIG.surgeMode = parsed.surgeMode;
        if(parsed.manualSurge) FARE_CONFIG.manualSurge = parsed.manualSurge;
        if(parsed.nightSurge) FARE_CONFIG.nightSurge = parsed.nightSurge;
      }
      var rows = await sbFetch('fare_settings?id=eq.default');
      if(rows && rows.length > 0){
        var remote = rows[0];
        FARE_CONFIG.bike = { base: remote.bike_base || 25, perKm: remote.bike_km || 7 };
        FARE_CONFIG.auto = { base: remote.auto_base || 35, perKm: remote.auto_km || 12 };
        FARE_CONFIG.auto_share = { base: remote.auto_share_base || 20, perKm: remote.auto_share_km || 6 };
        FARE_CONFIG.car = { base: remote.car_base || 60, perKm: remote.car_km || 16 };
        FARE_CONFIG.surgeMode = remote.surge_mode || 'auto';
        FARE_CONFIG.manualSurge = remote.manual_surge || 1.0;
        FARE_CONFIG.nightSurge = remote.night_surge || 1.2;
        localStorage.setItem('rydealot_fare_config', JSON.stringify(FARE_CONFIG));
      }
    } catch(e){
      console.log('Fare config sync note:', e.message);
    }
  }

  function getEstimatedTripDistanceKm(){
    if (state.tripDistanceKm && state.tripDistanceKm > 0) {
      return state.tripDistanceKm;
    }
    if(state.lat && state.lng && state.destLat && state.destLng){
      var dist = haversineKm(state.lat, state.lng, state.destLat, state.destLng);
      return Math.max(1.0, Math.round(dist * 1.35 * 10) / 10);
    }
    return 3.0; // 3 KM default for initial estimation
  }

  async function updateTripDistanceAndFares() {
    var distDisplay = document.getElementById('lot-trip-distance-display');
    if (!state.lat || !state.lng) return;

    // Auto-match drop text to landmark if destLat is missing
    if (!state.destLat || !state.destLng) {
      var dropTxt = (document.getElementById('drop-input').value || '').toLowerCase().trim();
      if (dropTxt && typeof TELANGANA_LANDMARKS !== 'undefined') {
        var match = TELANGANA_LANDMARKS.find(function(lm){
          return lm.name.toLowerCase().includes(dropTxt) || lm.aliases.some(function(a){ return a.includes(dropTxt); });
        });
        if (match) {
          state.destLat = match.lat;
          state.destLng = match.lng;
        }
      }
    }

    if (state.lat && state.lng && state.destLat && state.destLng) {
      var hDist = haversineKm(state.lat, state.lng, state.destLat, state.destLng);
      state.tripDistanceKm = Math.max(1.0, Math.round(hDist * 1.35 * 10) / 10);
      state.tripDurationMin = Math.max(3, Math.round(state.tripDistanceKm * 3));

      // Try OSRM Real Street Route
      try {
        var url = 'https://router.project-osrm.org/route/v1/driving/' + state.lng + ',' + state.lat + ';' + state.destLng + ',' + state.destLat + '?overview=false';
        var res = await fetch(url);
        var data = await res.json();
        if (data.routes && data.routes.length > 0) {
          var r = data.routes[0];
          state.tripDistanceKm = Math.max(1.0, Math.round((r.distance / 1000) * 10) / 10);
          state.tripDurationMin = Math.max(2, Math.round(r.duration / 60));
        }
      } catch(e) {}
    } else {
      state.tripDistanceKm = 3.0;
      state.tripDurationMin = 10;
    }

    if (distDisplay) {
      distDisplay.textContent = '📏 ' + state.tripDistanceKm + ' km (' + state.tripDurationMin + ' mins)';
    }

    refreshSurgeAndFares();
    updateBookButton();
  }

  function surgeMultiplierFor(type){
    if(FARE_CONFIG.surgeMode === 'manual'){
      return FARE_CONFIG.manualSurge || 1.0;
    }
    // During peak hours (8:30 AM - 10:30 AM & 5:30 PM - 8:30 PM) apply modest peak demand
    var hr = new Date().getHours();
    var min = new Date().getMinutes();
    var timeDec = hr + (min / 60);
    var isMorningPeak = (timeDec >= 8.5 && timeDec <= 10.5);
    var isEveningPeak = (timeDec >= 17.5 && timeDec <= 20.5);

    var mult = 1.0;
    if (isMorningPeak || isEveningPeak) {
      mult = 1.2; // 20% Peak Demand Multiplier (MoRTH compliant)
    }

    return Math.round(mult * 100) / 100;
  }

  var appliedPromoCode = null;
  var appliedPromoType = 'flat';
  var appliedPromoDiscountVal = 0;
  var appliedPromoMaxCap = 0;

  // ===== TIERED SLAB FARE ENGINE =====
  // 1. Short City Rides (0-8 km): Standard fair base rate
  // 2. Medium Distance (8-15 km): Tapered per-km rate
  // 3. Long Highway Trips (>15 km): Economy highway slab to beat Rapido/Ola while maximizing driver cash
  function calculateTieredBaseFare(type, distKm) {
    var d = Math.max(1.0, distKm || 1.0);
    
    var slabs = {
      bike:       { base: 25, slab1: 7.0,  slab2: 5.8, slab3: 4.8 },
      auto:       { base: 35, slab1: 11.5, slab2: 9.5, slab3: 8.0 },
      auto_share: { base: 20, slab1: 5.5,  slab2: 4.5, slab3: 3.8 },
      car:        { base: 60, slab1: 15.0, slab2: 13.5, slab3: 11.5 }
    };

    var s = slabs[type] || slabs.bike;

    if (d <= 2.0) {
      return s.base;
    }

    var fare = s.base;
    var remaining = d - 2.0;

    // Slab 1: 2 km to 8 km (up to 6 km)
    var d1 = Math.min(remaining, 6.0);
    fare += d1 * s.slab1;
    remaining -= d1;

    // Slab 2: 8 km to 15 km (up to 7 km)
    if (remaining > 0) {
      var d2 = Math.min(remaining, 7.0);
      fare += d2 * s.slab2;
      remaining -= d2;
    }

    // Slab 3: Beyond 15 km (long highway distance)
    if (remaining > 0) {
      fare += remaining * s.slab3;
    }

    return Math.round(fare);
  }

  function currentPriceFor(type){
    var distKm = getEstimatedTripDistanceKm();
    var baseAmount = calculateTieredBaseFare(type, distKm);

    var mult = surgeMultiplierFor(type);

    // Night surge check (10 PM to 6 AM: 20% driver night bonus)
    var hr = new Date().getHours();
    if(hr >= 22 || hr < 6){
      mult = mult * (FARE_CONFIG.nightSurge || 1.2);
    }

    var total = Math.round(baseAmount * mult);

    // 1. High Supply / Off-Peak Discount (when count >= 3 vehicles waiting)
    var count = countByType(type);
    if (count >= 3 && mult === 1.0) {
      total = Math.round(total * 0.90); // 10% Off-Peak Supply Discount
    }

    // 2. Promo Code Discount Subtraction
    if (appliedPromoDiscountVal > 0) {
      if (appliedPromoType === 'percentage') {
        var pctAmt = Math.round(total * (appliedPromoDiscountVal / 100));
        if (appliedPromoMaxCap > 0 && pctAmt > appliedPromoMaxCap) pctAmt = appliedPromoMaxCap;
        total = Math.max(15, total - pctAmt);
      } else {
        total = Math.max(15, total - appliedPromoDiscountVal);
      }
    }

    return Math.max(15, total);
  }

  function refreshSurgeAndFares(){
    var types = ['bike', 'auto', 'auto_share', 'car'];
    var anySurge = false;
    types.forEach(function(type){
      var count = countByType(type);
      var price = currentPriceFor(type);
      var mult = surgeMultiplierFor(type);
      if(mult > 1) anySurge = true;

      var countEl = document.getElementById('rt-count-' + type);
      var priceEl = document.getElementById('rt-price-' + type);
      if(countEl) countEl.textContent = count > 0 ? (count + ' waiting') : (type === 'auto_share' ? 'Shared' : 'none waiting');
      if(priceEl){
        priceEl.textContent = 'Rs ' + price;
        priceEl.classList.toggle('surge', mult > 1);
      }
    });
    updateReferralCardUI();
    updateDriverIncentivesUI();

    var surgeBanner = document.getElementById('surge-banner');
    var surgeText = document.getElementById('surge-text');
    if(anySurge){
      surgeBanner.classList.add('show');
      surgeText.textContent = 'Demand is high right now \u2014 prices have gone up';
    } else {
      surgeBanner.classList.remove('show');
    }

    updateBookButton();
  }

  function updateBookButton(){
    var btn = document.getElementById('book-btn');
    if (!btn) return;
    var type = state.selectedRideType || 'bike';
    var price = currentPriceFor(type);
    var count = countByType(type);
    var typeLabel = vehicleLabelOf(type);
    if(count > 0 || type === 'auto_share'){
      btn.textContent = 'Book ' + typeLabel + ' \u2014 Rs ' + price;
    } else {
      btn.textContent = 'Find ' + typeLabel + ' nearby \u2014 Rs ' + price;
    }
    btn.classList.remove('btn-pop-anim');
    void btn.offsetWidth;
    btn.classList.add('btn-pop-anim');
  }

  function updateStatus(){
    var n = countPresent();
    var label = document.getElementById('count-label');
    if(n > 0){
      label.textContent = n + (n === 1 ? ' vehicle waiting' : ' vehicles waiting');
      label.className = 'count ok';
    } else {
      label.textContent = 'No vehicles waiting';
      label.className = 'count empty';
    }
  }

  // Vehicles rest already facing right, so leaving is simple: back up to the
  // left first (a clear, slow beat), pause, then drive straight out to the
  // right and off the edge. No turning, so it can never cross into another
  // column's vehicles.
  // Vehicles rest facing the aisle (front pointing toward the center line).
  // Leaving: back out of the bay first (clear, slow beat), then cut diagonally
  // into the dedicated transit margin above the top row / below the bottom
  // row — fully clear of every other parked vehicle in either row — then
  // drive straight right and off the edge.
  function removeVehicle(id, onDone){
    var wrap = svg.querySelector('.slot-wrap[data-slot="'+id+'"]');
    present[id] = false;
    delete riderAssign[id];
    delete slotType[id];
    if(!wrap){
      updateStatus();
      if(onDone) onDone();
      return;
    }
    var x = parseFloat(wrap.getAttribute('data-x'));
    var y = parseFloat(wrap.getAttribute('data-y'));
    var rot = parseFloat(wrap.getAttribute('data-rot'));
    var facingDown = rot === 180; // top-row vehicles are rotated to face the aisle

    // Reverse far enough to fully clear the bay and land exactly on the
    // open transit line — so the pivot happens on that line, and everything
    // after the pivot is a pure straight horizontal drive, no diagonal drift.
    var clearY = facingDown ? 14 : 246;
    var reverseY = clearY;
    // The artwork's "front" points toward -y at rotation 0. Top-row vehicles
    // start at rot=180 (front toward +y, into the aisle); bottom-row vehicles
    // start at rot=0 (front toward -y, into the aisle). To end up facing
    // right with the front leading: top-row needs +90 from its base,
    // bottom-row needs -90.
    var rightFacingRot = facingDown ? 90 : -90;

    var keyframes = [
      // 1. Parked, facing into the aisle.
      { transform: 'translate('+x+'px,'+y+'px) rotate('+rot+'deg)', offset: 0 },
      // 2. Reverse straight back, fully out of the bay, until clear of the
      //    row entirely (still facing the original direction).
      { transform: 'translate('+x+'px,'+reverseY+'px) rotate('+rot+'deg)', offset: 0.32 },
      { transform: 'translate('+x+'px,'+reverseY+'px) rotate('+rot+'deg)', offset: 0.42 },
      // 3. Pivot in place to face right — a dead-stop turn, no movement.
      { transform: 'translate('+x+'px,'+reverseY+'px) rotate('+rightFacingRot+'deg)', offset: 0.52 },
      // 4. Drive dead straight to the right, off the edge — same y the
      //    whole way, since it's already on the clear line.
      { transform: 'translate(430px,'+reverseY+'px) rotate('+rightFacingRot+'deg)', offset: 1 }
    ];

    wrap.removeAttribute('transform');
    wrap.style.transformBox = 'view-box';

    var anim = wrap.animate(keyframes, {
      duration: 1800,
      easing: 'ease-in-out',
      fill: 'forwards'
    });

    anim.onfinish = function(){
      render();
      updateStatus();
      if(onDone) onDone();
    };
  }

  function nearestId(type){
    if(!present) return null;
    var ids = Object.keys(present).filter(function(k){ return present[k] && (!type || slotType[k] === type); });
    return ids.length ? ids[0] : null;
  }

  function countByType(type){
    if(!present) return 0;
    return Object.keys(present).filter(function(k){ return present[k] && slotType[k] === type; }).length;
  }

  function openDetail(id){
    var rider = riderAssign[id];
    if(!rider) return;
    var type = slotType[id];
    var typeLabel = vehicleLabelOf(type);
    var price = currentPriceFor(type);
    var mult = surgeMultiplierFor(type);
    var card = document.getElementById('detail-card');
    card.innerHTML =
      '<div class="detail-top">' +
        '<span class="detail-vehicle-tag '+type+'">'+typeLabel+'</span>' +
        '<button class="close-x" id="close-detail" aria-label="Close">&#10005;</button>' +
      '</div>' +
      '<div class="rider-row">' +
        '<div class="avatar">'+rider.initials+'</div>' +
        '<div>' +
          '<p class="rider-name">'+rider.name+'</p>' +
        '</div>' +
      '</div>' +
      '<div class="detail-grid">' +
        '<div class="detail-stat"><p class="k">Vehicle</p><p class="v">'+rider.vehicleLabel+'</p></div>' +
        '<div class="detail-stat"><p class="k">Plate</p><p class="v">'+rider.plate+'</p></div>' +
        '<div class="detail-stat"><p class="k">Distance away</p><p class="v">'+rider.distance+'</p></div>' +
        '<div class="detail-stat"><p class="k">Arrives in</p><p class="v">~'+rider.eta+'</p></div>' +
      '</div>' +
      '<div class="fare-row" style="margin:0 0 16px;">' +
        '<p class="k">Fare for this ride'+(mult > 1 ? ' (surge '+mult+'x)' : '')+'</p>' +
        '<p class="v">Rs '+price+'</p>' +
      '</div>' +
      '<button class="btn" id="detail-book-btn">Request this rider &mdash; Rs '+price+'</button>';

    document.getElementById('overlay').classList.add('show');
    document.getElementById('close-detail').addEventListener('click', closeDetail);
    document.getElementById('detail-book-btn').addEventListener('click', function(){
      closeDetail();
      confirmBooking(id, rider, type, price);
    });
  }

  function closeDetail(){
    document.getElementById('overlay').classList.remove('show');
  }

  document.getElementById('overlay').addEventListener('click', function(e){
    if(e.target.id === 'overlay') closeDetail();
  });

  // Creates a REAL booking row in Supabase and waits for the rider's own
  // app to accept it — plays realistic vehicle departure animation before switching screens
  async function confirmBooking(id, rider, type, price){
    if(state.activeBookingId || state.isBookingInProgress) return;
    state.isBookingInProgress = true;

    var btn = document.getElementById('book-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Departing lot... 🚗';
    }
    var detailBtn = document.getElementById('detail-book-btn');
    if (detailBtn) {
      detailBtn.disabled = true;
      detailBtn.textContent = 'Departing lot... 🚗';
    }

    // Play departure animation: vehicle reverses out of stall, turns right, and drives out
    var animFinished = false;
    var bookingResult = null;

    var tryProceedToTracking = function(){
      if(animFinished && bookingResult){
        goToTracking(rider, type, price, bookingResult.pin);
      }
    };

    if(id && present && present[id]){
      removeVehicle(id, function(){
        animFinished = true;
        tryProceedToTracking();
      });
    } else {
      animFinished = true;
    }

    try{
      var pin = Math.floor(1000 + Math.random() * 9000);
      var mapsLink = '';
      if(state.destLat && state.destLng){
        mapsLink = 'https://www.google.com/maps/dir/?api=1&destination=' + state.destLat + ',' + state.destLng + '&travelmode=driving&pin=' + pin;
      } else {
        var query = state.drop || '';
        mapsLink = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query) + '&pin=' + pin;
      }
      var rows = await sbFetch('bookings', {
        method: 'POST',
        prefer: 'return=representation',
        body: {
          rider_id: rider.dbId,
          user_name: state.userName,
          pickup_lat: state.lat,
          pickup_lng: state.lng,
          pickup_label: state.pickup,
          drop_label: state.drop,
          vehicle_type: type,
          fare: price,
          status: 'requested',
          maps_link: mapsLink
        }
      });
      var row = Array.isArray(rows) ? rows[0] : rows;
      state.activeBookingId = row.id;
      state.activeRider = rider;
      state.activeType = type;
      state.activePrice = price;

      // Save active booking to localStorage for instant reload/refresh persistence!
      try {
        localStorage.setItem('rydealot_active_booking', JSON.stringify({
          bookingId: row.id,
          rider: rider,
          type: type,
          price: price,
          pin: pin,
          pickup: state.pickup,
          drop: state.drop,
          lat: state.lat,
          lng: state.lng,
          destLat: state.destLat,
          destLng: state.destLng
        }));
      } catch(e) { console.error('Could not save booking to cache:', e); }

      clearLotState();

      // Lock used coupon so customer cannot reuse it
      if (appliedPromoCode) {
        markCouponUsedForUser(appliedPromoCode);
        appliedPromoCode = null;
        appliedPromoDiscountVal = 0;
        var promoInp = document.getElementById('input-promo-code');
        if (promoInp) promoInp.value = '';
        var promoMsgEl = document.getElementById('promo-status-msg');
        if (promoMsgEl) promoMsgEl.style.display = 'none';
      }
      clearInterval(pollTimer);
      toast('Request sent to ' + rider.name);
      bookingResult = { pin: pin };
      tryProceedToTracking();
    } catch(err){
      toast('Could not send request: ' + err.message);
      state.isBookingInProgress = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Book nearest ' + type + ' \u2014 Rs ' + price;
      }
      if (detailBtn) {
        detailBtn.disabled = false;
        detailBtn.textContent = 'Request this rider \u2014 Rs ' + price;
      }
    }
  }

  document.getElementById('book-btn').addEventListener('click', function(){
    var type = state.selectedRideType || 'bike';
    var id = nearestId(type);
    if(!id){
      document.getElementById('bonus-text').textContent = 'No ' + type + 's nearby right now. Try a different vehicle type, or check back shortly.';
      document.getElementById('bonus-banner').classList.add('show');
      return;
    }
    var rider = riderAssign[id];
    var price = currentPriceFor(type);
    confirmBooking(id, rider, type, price);
  });

  // ---------------- tracking screen ----------------

  function vehicleIconSvg(type, color){
    var col = color || '#16181c';
    var bodyMarkup = '';
    if(type === 'bike'){
      bodyMarkup =
        '<rect x="-6.5" y="20" width="13" height="22" rx="5" fill="#202225" transform="translate(0,-2)"/>' +
        '<rect x="-5" y="21.5" width="10" height="19" rx="4" fill="#3a3d42" transform="translate(0,-2)"/>' +
        '<rect x="-9" y="-4" width="18" height="28" rx="7" fill="'+col+'" transform="translate(0,-2)"/>' +
        '<ellipse cx="0" cy="-16" rx="8.5" ry="11" fill="'+col+'"/>' +
        '<ellipse cx="0" cy="-17" rx="5.5" ry="7" fill="rgba(255,255,255,0.25)"/>' +
        '<rect x="-13" y="-28" width="26" height="5.5" rx="2.5" fill="'+col+'"/>' +
        '<rect x="-1.6" y="-30" width="3.2" height="10" rx="1.4" fill="'+col+'"/>' +
        '<rect x="-6.5" y="-38" width="13" height="14" rx="4.5" fill="#202225"/>' +
        '<rect x="-5" y="-36.5" width="10" height="11" rx="3.5" fill="#3a3d42"/>';
    } else if(type === 'auto' || type === 'auto_share'){
      bodyMarkup =
        '<rect x="-15" y="14" width="11" height="16" rx="4" fill="#202225"/>' +
        '<rect x="4" y="14" width="11" height="16" rx="4" fill="#202225"/>' +
        '<path d="M-17 18 L-17 -10 A17 17 0 0117 -10 L17 18 Z" fill="'+col+'"/>' +
        '<rect x="-13" y="-6" width="26" height="20" rx="4" fill="rgba(255,255,255,0.25)"/>' +
        '<rect x="-3" y="-24" width="6" height="16" rx="2.5" fill="#202225"/>' +
        '<rect x="-15" y="-28" width="30" height="6" rx="3" fill="'+col+'"/>';
    } else {
      bodyMarkup =
        '<rect x="-19.5" y="-41" width="39" height="82" rx="11" fill="'+col+'"/>' +
        '<rect x="-15" y="-30" width="30" height="22" rx="5" fill="#aab4c2" opacity="0.85"/>' +
        '<rect x="-15" y="9" width="30" height="20" rx="5" fill="#aab4c2" opacity="0.85"/>' +
        '<rect x="-22.5" y="-14" width="4" height="11" rx="2" fill="#1c1e21"/>' +
        '<rect x="18.5" y="-14" width="4" height="11" rx="2" fill="#1c1e21"/>' +
        '<line x1="-19.5" y1="0" x2="19.5" y2="0" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>';
    }
    return '<svg viewBox="-26 -46 52 92" xmlns="http://www.w3.org/2000/svg">'+bodyMarkup+'</svg>';
  }

  function vehicleLabelOf(type){
    if(type === 'bike') return 'Bike';
    if(type === 'auto') return 'Auto (Direct)';
    if(type === 'auto_share') return 'Auto Share';
    return 'Car / Cab';
  }

  function destroyMap() {
    if (state.map) {
      try {
        state.map.remove();
      } catch (e) { console.error('Error removing map:', e); }
      state.map = null;
      state.driverMarker = null;
      state.passengerMarker = null;
    }
  }

  function goToTracking(rider, type, price, pin){
    rider = rider || state.activeRider || state.currentRider || {};
    if (!rider.name) rider.name = 'Driver';
    if (!rider.initials) rider.initials = (rider.name || 'D').substring(0, 2).toUpperCase();
    if (!rider.vehicleLabel) rider.vehicleLabel = vehicleLabelOf(type || 'bike');
    if (!rider.plate) rider.plate = '';

    state.currentRider = rider;
    state.currentType = type;
    state.currentFare = price;
    document.getElementById('track-avatar').textContent = rider.initials;
    document.getElementById('track-name').textContent = rider.name;
    document.getElementById('track-vehicle-info').textContent = rider.vehicleLabel + ' \u00b7 ' + rider.plate;
    document.getElementById('confirm-vehicle-icon').innerHTML = vehicleIconSvg(type, '#1d9e75');

    if (state.lastKnownStatus === 'in_progress') {
      document.getElementById('tracking-sub').textContent = 'Trip in progress to ' + (state.drop || 'destination');
      document.getElementById('track-step-2').textContent = 'Trip in progress to ' + (state.drop || 'destination');
      document.getElementById('cancel-trip-btn').style.display = 'none';
    } else if (state.lastKnownStatus === 'arrived') {
      document.getElementById('tracking-sub').textContent = rider.name + ' has arrived at ' + (state.pickup || 'pickup');
      document.getElementById('track-step-2').textContent = 'Rider has arrived at pickup';
    } else if (state.lastKnownStatus === 'accepted') {
      document.getElementById('tracking-sub').textContent = rider.name + ' accepted \u2014 heading to ' + (state.pickup || 'pickup');
      document.getElementById('track-step-2').textContent = 'Rider heading to ' + (state.pickup || 'pickup');
    } else {
      document.getElementById('tracking-sub').textContent = 'Waiting for ' + rider.name + ' to accept...';
      document.getElementById('track-step-2').textContent = 'Waiting for rider to accept';
      document.getElementById('cancel-trip-btn').style.display = 'block';
      document.getElementById('cancel-trip-btn').disabled = false;
    }

    // Show PIN immediately — no need to wait for DB polling
    if(pin){
      document.getElementById('track-pin-code').textContent = String(pin);
    }
    showScreen('screen-tracking');

    // Initialize Leaflet Map
    try {
      destroyMap();
      if (state.lat != null && state.lng != null) {
        state.map = L.map('map', {
          zoomControl: false,
          attributionControl: false
        }).setView([state.lat, state.lng], 15);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          maxZoom: 19
        }).addTo(state.map);

        var passengerIcon = L.divIcon({
          html: '<div style="background-color:#1d9e75; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>',
          className: 'custom-passenger-icon',
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        });
        state.passengerMarker = L.marker([state.lat, state.lng], { icon: passengerIcon }).addTo(state.map);
        
        var driverIcon = L.divIcon({
          html: '<div style="background-color:#16181c; color:#fff; width:22px; height:22px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold; box-shadow:0 1px 4px rgba(0,0,0,0.4);">' + (type === 'bike' ? 'B' : (type === 'auto' ? 'A' : 'C')) + '</div>',
          className: 'custom-driver-icon',
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });
        state.driverMarker = L.marker([state.lat, state.lng], { icon: driverIcon }).addTo(state.map);
        
        state.map.fitBounds(L.latLngBounds([[state.lat, state.lng]]));
      }
    } catch (err) {
      console.error('Failed to initialize Leaflet Map:', err);
    }

    startBookingStatusPoll();
  }

  function startBookingStatusPoll(){
    clearInterval(state.bookingPollTimer);
    pollBookingStatus();
    state.bookingPollTimer = setInterval(pollBookingStatus, 3000);
  }

  async function pollBookingStatus(){
    if(!state.activeBookingId) return;
    try{
      var rows = await sbFetch('bookings?id=eq.' + state.activeBookingId);
      var b = rows[0];
      if(!b) return;
      state.lastKnownStatus = b.status;
      if(b.maps_link){
        var pinMatch = b.maps_link.match(/[?&]pin=(\d{4})/);
        if(pinMatch){
          document.getElementById('track-pin-code').textContent = pinMatch[1];
        }
      }
      var sub = document.getElementById('tracking-sub');
      var step2 = document.getElementById('track-step-2');

      if(b.status === 'requested'){
        sub.textContent = 'Waiting for ' + state.currentRider.name + ' to accept...';
      } else if(b.status === 'accepted'){
        sub.textContent = state.currentRider.name + ' accepted \u2014 heading to ' + state.pickup;
        step2.textContent = 'Rider heading to ' + state.pickup;
        if(!state.exitAnimationPlayed){
          state.exitAnimationPlayed = true;
          var slotId = Object.keys(riderAssign).filter(function(k){ return riderAssign[k] && riderAssign[k].dbId === state.currentRider.dbId; })[0];
          if(slotId) removeVehicle(slotId, function(){});
        }
        
        // Fetch and update driver live position
        try {
          var riderRows = await sbFetch('riders?id=eq.' + state.currentRider.dbId);
          var r = riderRows[0];
          if (r && r.lat != null && r.lng != null && state.map && state.driverMarker) {
            state.driverMarker.setLatLng([r.lat, r.lng]);
            var bounds = L.latLngBounds([[state.lat, state.lng], [r.lat, r.lng]]);
            state.map.fitBounds(bounds, { padding: [30, 30] });
          }
        } catch (e) { console.error('Failed to update driver marker location', e); }

      } else if(b.status === 'arrived'){
        sub.textContent = state.currentRider.name + ' has arrived at ' + state.pickup;
        if (state.map && state.driverMarker) {
          state.driverMarker.setLatLng([state.lat, state.lng]);
        }
      } else if(b.status === 'in_progress'){
        sub.textContent = 'Trip in progress to ' + state.drop;
        // Continue displaying live driver coordinates
        try {
          var riderRows = await sbFetch('riders?id=eq.' + state.currentRider.dbId);
          var r = riderRows[0];
          if (r && r.lat != null && r.lng != null && state.map && state.driverMarker) {
            state.driverMarker.setLatLng([r.lat, r.lng]);
            state.map.panTo([r.lat, r.lng]);
          }
        } catch (e) { console.error(e); }

      } else if(b.status === 'completed'){
        clearInterval(state.bookingPollTimer);
        destroyMap();
        localStorage.removeItem('rydealot_active_booking');
        
        document.getElementById('payment-amount').textContent = 'Rs ' + (b.fare || '0');
        document.getElementById('payment-options-container').style.display = 'flex';
        document.getElementById('upi-loading-container').style.display = 'none';
        document.getElementById('payment-done-btn').style.display = 'none';
        
        showScreen('screen-payment');
      } else if(b.status === 'cancelled'){
        sub.textContent = 'This request was cancelled or declined.';
        clearInterval(state.bookingPollTimer);
        state.activeBookingId = null;
        state.isBookingInProgress = false;
        localStorage.removeItem('rydealot_active_booking');
        var btn = document.getElementById('book-btn');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Book nearest ' + state.selectedRideType + ' \u2014 Rs ' + currentPriceFor(state.selectedRideType);
        }
        setTimeout(function(){
          toast('Trip was cancelled or declined. You can request another rider.');
          showScreen('screen-lot');
        }, 2000);
      }
    } catch(err){
      console.error('poll booking failed', err);
    }
  }

  document.getElementById('cancel-trip-btn').addEventListener('click', async function(){
    clearInterval(state.bookingPollTimer);
    destroyMap();
    localStorage.removeItem('rydealot_active_booking');
    if(!state.activeBookingId){
      showScreen('screen-login');
      return;
    }
    try{
      var bRows = await sbFetch('bookings?id=eq.' + state.activeBookingId);
      var b = bRows && bRows[0];
      await sbFetch('bookings?id=eq.' + state.activeBookingId, { method: 'PATCH', body: { status: 'cancelled' } });
      if (b && b.rider_id) {
        await sbFetch('riders?id=eq.' + b.rider_id, { method: 'PATCH', body: { status: 'available', updated_at: new Date().toISOString() } });
      }
    } catch(err){ console.error(err); }
    var feeApplies = state.lastKnownStatus === 'arrived' || state.lastKnownStatus === 'in_progress';
    toast(feeApplies ? 'Trip cancelled. A cancellation fee of Rs 20 applies.' : 'Trip cancelled \u2014 no charge.');
    document.getElementById('cancel-trip-btn').style.display = 'none';
    state.activeBookingId = null;
    state.isBookingInProgress = false;
    state.exitAnimationPlayed = false;
    state.trackAnimPlayed = false;
    showScreen('screen-lot');
    await resetLot();
  });

  document.getElementById('tracking-close').addEventListener('click', function(){
    clearInterval(state.bookingPollTimer);
    destroyMap();
    localStorage.removeItem('rydealot_active_booking');
    showScreen('screen-login');
  });

  // ---- Payment / UPI Simulator Screen Logic ----
  document.getElementById('btn-pay-cash').addEventListener('click', function(){
    document.getElementById('payment-options-container').style.display = 'none';
    document.getElementById('upi-loading-container').style.display = 'flex';
    document.getElementById('upi-status-text').innerHTML = 'Cash Payment Confirmed! 💵<br><span style="font-size:12px;color:var(--text-mute);">Thank the driver and have a great day!</span>';
    document.getElementById('upi-spinner').style.display = 'none';
    document.getElementById('payment-done-btn').style.display = 'block';
  });

  document.getElementById('btn-pay-upi').addEventListener('click', function(){
    document.getElementById('payment-options-container').style.display = 'none';
    var loadingContainer = document.getElementById('upi-loading-container');
    var statusText = document.getElementById('upi-status-text');
    var spinner = document.getElementById('upi-spinner');
    
    loadingContainer.style.display = 'flex';
    spinner.style.display = 'block';
    statusText.textContent = 'Connecting to secure UPI gateway...';
    
    setTimeout(function(){
      statusText.textContent = 'Processing transaction... 💳';
      setTimeout(function(){
        statusText.innerHTML = 'Payment Successful! Rs ' + document.getElementById('payment-amount').textContent.replace('Rs ', '') + ' received. ✅<br><span style="font-size:12.5px;color:var(--green);font-weight:bold;">Have a nice day! 😊</span>';
        spinner.style.display = 'none';
        document.getElementById('payment-done-btn').style.display = 'block';
      }, 1800);
    }, 1500);
  });

  document.getElementById('payment-done-btn').addEventListener('click', function(){
    state.activeBookingId = null;
    state.exitAnimationPlayed = false;
    state.trackAnimPlayed = false;
    localStorage.removeItem('rydealot_active_booking');
    showScreen('screen-login');
  });

  // init: fill in the static ride-type icons right away; the lot itself
  // only loads real data once the user submits their name and location.
  document.getElementById('rt-icon-bike').innerHTML = vehicleIconSvg('bike', '#16181c');
  document.getElementById('rt-icon-auto').innerHTML = vehicleIconSvg('auto', '#16181c');
  if(document.getElementById('rt-icon-auto_share')) document.getElementById('rt-icon-auto_share').innerHTML = vehicleIconSvg('auto_share', '#16181c');
  document.getElementById('rt-icon-car').innerHTML = vehicleIconSvg('car', '#16181c');

  loadFareConfig();

  // ===== AUTOMATIC ACTIVE RIDE RESTORATION ON REFRESH =====
  async function restoreActiveCustomerBooking() {
    try {
      var raw = localStorage.getItem('rydealot_active_booking');
      if (!raw) return false;
      var saved = JSON.parse(raw);
      if (!saved || !saved.bookingId) return false;

      // Ensure rider object has all needed properties safely
      var rider = saved.rider || {};
      if (!rider.name) rider.name = 'Driver';
      if (!rider.initials) rider.initials = (rider.name || 'D').substring(0, 2).toUpperCase();
      if (!rider.vehicleLabel) rider.vehicleLabel = vehicleLabelOf(saved.type || 'bike');
      if (!rider.plate) rider.plate = '';

      state.activeBookingId = saved.bookingId;
      state.activeRider = rider;
      state.currentRider = rider;
      state.activeType = saved.type;
      state.activePrice = saved.price;
      state.pickup = saved.pickup || 'Pickup';
      state.drop = saved.drop || 'Drop';
      state.lat = saved.lat;
      state.lng = saved.lng;
      state.destLat = saved.destLat;
      state.destLng = saved.destLng;

      // Immediately display tracking screen with cached data so NO BLANK OR HOME FLASH
      goToTracking(rider, saved.type, saved.price, saved.pin);

      // Background query to Supabase to verify live status and update UI
      try {
        var rows = await sbFetch('bookings?id=eq.' + saved.bookingId);
        var b = rows && rows[0];
        if (b) {
          if (b.status === 'completed') {
            localStorage.removeItem('rydealot_active_booking');
            clearInterval(state.bookingPollTimer);
            destroyMap();
            document.getElementById('payment-amount').textContent = 'Rs ' + (b.fare || saved.price || '0');
            document.getElementById('payment-options-container').style.display = 'flex';
            document.getElementById('upi-loading-container').style.display = 'none';
            document.getElementById('payment-done-btn').style.display = 'none';
            showScreen('screen-payment');
            return true;
          } else if (b.status === 'cancelled') {
            localStorage.removeItem('rydealot_active_booking');
            clearInterval(state.bookingPollTimer);
            state.activeBookingId = null;
            state.isBookingInProgress = false;
            toast('This trip was cancelled.');
            showScreen('screen-lot');
            return false;
          } else {
            // Live active trip (requested, accepted, arrived, in_progress)
            state.lastKnownStatus = b.status;
            if (b.maps_link) {
              var pinMatch = b.maps_link.match(/[?&]pin=(\d{4})/);
              if (pinMatch) document.getElementById('track-pin-code').textContent = pinMatch[1];
            }

            var sub = document.getElementById('tracking-sub');
            var step2 = document.getElementById('track-step-2');
            var cancelBtn = document.getElementById('cancel-trip-btn');

            if (b.status === 'in_progress') {
              if (sub) sub.textContent = 'Trip in progress to ' + state.drop;
              if (step2) step2.textContent = 'Trip in progress to ' + state.drop;
              if (cancelBtn) cancelBtn.style.display = 'none';
            } else if (b.status === 'arrived') {
              if (sub) sub.textContent = rider.name + ' has arrived at ' + state.pickup;
              if (step2) step2.textContent = 'Rider has arrived at pickup';
            } else if (b.status === 'accepted') {
              if (sub) sub.textContent = rider.name + ' accepted \u2014 heading to ' + state.pickup;
              if (step2) step2.textContent = 'Rider heading to ' + state.pickup;
            }
          }
        }
      } catch(netErr) {
        console.warn('Background status sync skipped (offline or slow network):', netErr);
      }

      return true;
    } catch(e) {
      console.error('Error in restoreActiveCustomerBooking:', e);
      return false;
    }
  }

  // ===== AUTOMATIC PARKING LOT RESTORATION ON ACCIDENTAL REFRESH =====
  async function restoreLotState() {
    try {
      var raw = localStorage.getItem('rydealot_lot_state');
      if (!raw) return false;
      var saved = JSON.parse(raw);
      if (!saved || !saved.active) return false;

      // Expire if older than 2 hours
      if (Date.now() - (saved.timestamp || 0) > 2 * 60 * 60 * 1000) {
        localStorage.removeItem('rydealot_lot_state');
        return false;
      }

      if (saved.userName) state.userName = saved.userName;
      state.pickup = saved.pickup || 'Current Location';
      state.drop = saved.drop || 'Destination';
      if (saved.lat && saved.lng) {
        state.lat = saved.lat;
        state.lng = saved.lng;
      }
      if (saved.destLat && saved.destLng) {
        state.destLat = saved.destLat;
        state.destLng = saved.destLng;
      }
      state.tripDistanceKm = saved.tripDistanceKm || 3.0;
      state.tripDurationMin = saved.tripDurationMin || 10;
      state.selectedRideType = saved.selectedRideType || 'bike';

      // Prefill input fields on screen-login so if they go back, inputs are preserved!
      var nameInput = document.getElementById('login-name');
      var pickupInput = document.getElementById('pickup-input');
      var dropInput = document.getElementById('drop-input');
      if (nameInput && saved.userName) nameInput.value = saved.userName;
      if (pickupInput && saved.pickup) pickupInput.value = saved.pickup;
      if (dropInput && saved.drop) dropInput.value = saved.drop;

      // Update lot screen header & info
      var lotTitle = document.getElementById('lot-title');
      if (lotTitle) lotTitle.textContent = state.pickup + ' \u2192 ' + state.drop;
      var lotPlace = document.getElementById('lot-place-name');
      if (lotPlace) lotPlace.textContent = state.pickup;

      if (state.lat && state.lng) {
        var coordsEl = document.getElementById('lot-coords-display');
        if (coordsEl) coordsEl.textContent = 'GPS Active: ' + state.lat.toFixed(5) + ', ' + state.lng.toFixed(5);
        var coordsCont = document.getElementById('lot-coords-display-container');
        if (coordsCont) coordsCont.style.display = 'flex';
      }

      var distDisplay = document.getElementById('lot-trip-distance-display');
      if (distDisplay) {
        distDisplay.textContent = '📏 ' + state.tripDistanceKm + ' km (' + state.tripDurationMin + ' mins)';
      }

      // Set active ride type card
      Array.prototype.forEach.call(document.querySelectorAll('.ride-type-card'), function(c){
        c.classList.toggle('selected', c.getAttribute('data-type') === state.selectedRideType);
      });

      // Show lot screen and refresh vehicles & fares
      showScreen('screen-lot');
      await resetLot();
      return true;
    } catch(e) {
      console.error('Error restoring lot state:', e);
      return false;
    }
  }

  // Automatic startup triggers for passenger side map & location or active ride/lot restore
  restoreActiveCustomerBooking().then(async function(restored) {
    if (!restored) {
      var lotRestored = await restoreLotState();
      if (!lotRestored) {
        try {
          var lastSearch = JSON.parse(localStorage.getItem('rydealot_last_search') || '{}');
          var pInp = document.getElementById('pickup-input');
          var dInp = document.getElementById('drop-input');
          if (pInp && !pInp.value && lastSearch.pickup) pInp.value = lastSearch.pickup;
          if (dInp && !dInp.value && lastSearch.drop) dInp.value = lastSearch.drop;
        } catch(e) {}

        setTimeout(function(){
          initSetupMap();
          autoFindLocation();
        }, 300);
      }
    }
  });

  // Re-initialize setup map if roles switch
  window.addEventListener('roleswitch', function(e){
    if (e.detail.role === 'user') {
      setTimeout(function(){
        initSetupMap();
        updateSetupMapMarkers();
      }, 150);
    }
  });
})();

// ===================== PWA Installation & Service Worker Registration =====================
(function() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('./sw.js').then(function(reg) {
        console.log('ServiceWorker registration successful with scope: ', reg.scope);
      }).catch(function(err) {
        console.log('ServiceWorker registration skipped (Incognito or blocked): ', err.message);
      });
    });
  }

  var deferredPrompt = null;
  var installButtons = document.querySelectorAll('.pwa-install-btn');

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    installButtons.forEach(function(btn) {
      btn.style.display = 'inline-block';
    });
  });

  installButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function(choiceResult) {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        } else {
          console.log('User dismissed the install prompt');
        }
        deferredPrompt = null;
        installButtons.forEach(function(b) {
          b.style.display = 'none';
        });
      });
    });
  });

  window.addEventListener('appinstalled', function(e) {
    console.log('App successfully installed on home screen');
    installButtons.forEach(function(b) {
      b.style.display = 'none';
    });
  });
})();
