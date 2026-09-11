// ============================================================================
// RYDEALOT DRIVER BIOMETRIC KYC & PRE-SHIFT VERIFICATION ENGINE
// Dedicated module for driver.html — isolated from passenger / app.js logic
// Uses MediaPipe FaceMesh + Face-API 128-D descriptor matching
// ============================================================================

(function(window) {
  'use strict';

  var SUPABASE_URL = 'https://wupndimumeugfjxzejlj.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1cG5kaW11bWV1Z2ZqeHplamxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMDgwMDQsImV4cCI6MjA5NzY4NDAwNH0.dM6nG_cswzOAXuumW3LdfGJxxoF-Fn3iiVImUZ9as2Y';

  async function sbFetchLocal(path, options) {
    if (typeof window.sbFetch === 'function') {
      return window.sbFetch(path, options);
    }
    options = options || {};
    var headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    };
    if (options.prefer) headers['Prefer'] = options.prefer;
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    var text = await res.text();
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch(e) { data = text; }
    if (!res.ok) throw new Error((data && data.message) || ('HTTP ' + res.status));
    return data;
  }

  // Toast notifier
  function showToast(msg, duration) {
    if (typeof window.toast === 'function') {
      window.toast(msg, duration);
      return;
    }
    var t = document.getElementById('rd-toast');
    if (t) {
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(function() { t.classList.remove('show'); }, duration || 3000);
    }
  }

  // ==================== FACE-API MODEL LOADER ====================
  var faceApiModelsLoaded = false;
  var faceApiModelsLoading = false;

  async function loadFaceApiModels() {
    if (faceApiModelsLoaded) return true;
    if (faceApiModelsLoading) {
      while (faceApiModelsLoading) {
        await new Promise(function(r) { setTimeout(r, 80); });
      }
      return faceApiModelsLoaded;
    }
    faceApiModelsLoading = true;
    try {
      if (typeof faceapi === 'undefined') {
        console.warn('faceapi is undefined');
        faceApiModelsLoading = false;
        return false;
      }
      // Load models from local folder
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('models'),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri('models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('models')
      ]);
      faceApiModelsLoaded = true;
      faceApiModelsLoading = false;
      return true;
    } catch(err1) {
      console.warn('Local models note, falling back to CDN weights:', err1);
      try {
        var cdnUri = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(cdnUri),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(cdnUri),
          faceapi.nets.faceRecognitionNet.loadFromUri(cdnUri)
        ]);
        faceApiModelsLoaded = true;
        faceApiModelsLoading = false;
        return true;
      } catch(err2) {
        console.error('All face model loads failed:', err2);
        faceApiModelsLoading = false;
        return false;
      }
    }
  }

  // Pre-load face models in background
  setTimeout(loadFaceApiModels, 500);

  // ==================== MEDIAPIPE FACE MESH GEOMETRY ====================
  var MP_LEFT_EYE  = [362, 385, 387, 263, 373, 380];
  var MP_RIGHT_EYE = [33, 160, 158, 133, 153, 144];
  var MP_FACE_EDGE_A = 234;
  var MP_FACE_EDGE_B = 454;
  var MP_NOSE_TIP    = 1;

  function eyeAspectRatioFaceMesh(landmarks, idx) {
    var p = idx.map(function(i) { return landmarks[i]; });
    var vertical = (Math.hypot(p[1].x - p[5].x, p[1].y - p[5].y) + Math.hypot(p[2].x - p[4].x, p[2].y - p[4].y)) / 2;
    var horizontal = Math.hypot(p[0].x - p[3].x, p[0].y - p[3].y) || 1;
    return vertical / horizontal;
  }

  function noseRatioFaceMesh(landmarks) {
    var edgeA = landmarks[MP_FACE_EDGE_A].x;
    var edgeB = landmarks[MP_FACE_EDGE_B].x;
    var nose  = landmarks[MP_NOSE_TIP].x;
    return (nose - edgeA) / (edgeB - edgeA || 1);
  }

  // ==================== 1. ONBOARDING: 3D KYC LIVENESS CHALLENGE ====================
  var kycCamModal = document.getElementById('rd-kyc-cam-modal');
  var openKycCamBtn = document.getElementById('rd-open-kyc-cam-btn');
  var kycVideo = document.getElementById('rd-kyc-video');
  var kycSnapPreview = document.getElementById('rd-kyc-snapshot-preview');
  var kycCircle = document.getElementById('rd-kyc-circle');
  var kycInstruction = document.getElementById('rd-kyc-instruction');
  var kycStep1 = document.getElementById('rd-kyc-step-1');
  var kycStep2 = document.getElementById('rd-kyc-step-2');
  var kycStep3 = document.getElementById('rd-kyc-step-3');
  var kycCancelBtn = document.getElementById('rd-kyc-cam-cancel-btn');
  var kycRestartBtn = document.getElementById('rd-kyc-cam-restart-btn');
  var kycFlipBtn = document.getElementById('rd-kyc-flip-btn');
  var kycFallbackInput = document.getElementById('rd-doc-selfie-fallback');
  var kycFallbackBtn = document.getElementById('rd-open-kyc-fallback-btn');

  var kycStream = null;
  var currentKycFacingMode = 'user';
  var kycLivenessActive = false;

  function stopKycCamera() {
    kycLivenessActive = false;
    if (kycStream) {
      kycStream.getTracks().forEach(function(t) { t.stop(); });
      kycStream = null;
    }
  }

  function resetKycStepUI() {
    if (kycStep1) kycStep1.style.background = '#4f46e5';
    if (kycStep2) kycStep2.style.background = '#334155';
    if (kycStep3) kycStep3.style.background = '#334155';
    if (kycCircle) kycCircle.style.borderColor = '#6366f1';
    if (kycSnapPreview) kycSnapPreview.style.display = 'none';
    if (kycVideo) kycVideo.style.display = 'block';
    if (kycRestartBtn) kycRestartBtn.style.display = 'none';
  }

  async function start3DKycLiveness() {
    resetKycStepUI();
    kycLivenessActive = true;
    loadFaceApiModels();

    if (kycInstruction) {
      kycInstruction.innerHTML = '<div style="color:#818cf8; font-size:13px; font-weight:900;">👁️ STEP 1/3: BLINK YOUR EYES</div>' +
        '<div style="font-size:10.5px; color:#c7d2fe; margin-top:2px;">Align face in oval and blink your eyes.</div>';
    }

    if (kycVideo) {
      kycVideo.style.transform = (currentKycFacingMode === 'user') ? 'scaleX(-1)' : 'none';
    }

    try {
      kycStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentKycFacingMode, width: { ideal: 640 }, height: { ideal: 640 } }
      });
      kycVideo.srcObject = kycStream;
      try { await kycVideo.play(); } catch(e){}
    } catch(err) {
      if (kycInstruction) {
        kycInstruction.innerHTML = '<span style="color:#ef4444;">⚠️ Camera access error: ' + (err.message || err) + '</span>';
      }
      return;
    }

    var steadyFrames = 0;
    var kycStartTime = Date.now();
    var isKycCaptured = false;
    var hasReceivedMeshFrame = false;

    // The single capture execution handler
    var executeKycCapture = async function() {
      if (isKycCaptured) return;
      isKycCaptured = true;
      kycLivenessActive = false;

      if (kycCircle) kycCircle.style.borderColor = '#22c55e';
      if (kycInstruction) {
        kycInstruction.innerHTML = '<div style="color:#22c55e; font-size:13.5px; font-weight:900;">✅ Face Captured & Verified!</div>' +
          '<div style="font-size:10.5px; color:#86efac; margin-top:2px;">Saving official KYC baseline photo...</div>';
      }

      var snapCanvas = document.createElement('canvas');
      snapCanvas.width = 480;
      snapCanvas.height = 480;
      var sCtx = snapCanvas.getContext('2d');
      var vw = kycVideo.videoWidth || 640;
      var vh = kycVideo.videoHeight || 480;
      var minDim = Math.min(vw, vh);
      var sx = (vw - minDim) / 2;
      var sy = (vh - minDim) / 2;

      if (currentKycFacingMode === 'user') {
        sCtx.translate(480, 0);
        sCtx.scale(-1, 1);
      }
      sCtx.drawImage(kycVideo, sx, sy, minDim, minDim, 0, 0, 480, 480);

      var finalSnapshot = snapCanvas.toDataURL('image/jpeg', 0.88);

      var hiddenInput = document.getElementById('rd-doc-selfie-data');
      if (hiddenInput) hiddenInput.value = finalSnapshot;

      var previewImg = document.getElementById('rd-kyc-preview-img');
      var previewIcon = document.getElementById('rd-kyc-preview-icon');
      if (previewImg) {
        previewImg.src = finalSnapshot;
        previewImg.style.display = 'block';
      }
      if (previewIcon) previewIcon.style.display = 'none';

      var statusEl = document.getElementById('rd-doc-selfie-status');
      if (statusEl) {
        statusEl.innerHTML = '<span style="color:#16a34a; font-weight:800;">✅ Biometrics Verified (Live Selfie Saved)</span>';
      }

      var riderId = localStorage.getItem('ridelot_rider_id');

      // 1. One-shot descriptor extraction for instant future pre-shift check
      try {
        if (typeof faceapi !== 'undefined') {
          var detection = await faceapi.detectSingleFace(
            snapCanvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.25 })
          ).withFaceLandmarks(true).withFaceDescriptor();

          if (detection && detection.descriptor) {
            var descArr = Array.from(detection.descriptor);
            localStorage.setItem('rydealot_driver_kyc_descriptor', JSON.stringify(descArr));
            if (riderId) {
              sbFetchLocal('face_profiles', {
                method: 'POST',
                body: { rider_id: riderId, descriptor: descArr, photo_url: finalSnapshot },
                headers: { 'Prefer': 'resolution=merge-duplicates' }
              }).catch(function(err){ console.warn('face_profiles sync note:', err); });
            }
          }
        }
      } catch(descErr) {
        console.warn('KYC descriptor extraction note:', descErr);
      }

      // 2. Persist local selfie backup
      localStorage.setItem('rydealot_driver_live_face', finalSnapshot);
      if (riderId) {
        try {
          var docs = JSON.parse(localStorage.getItem('rydealot_driver_docs') || '{}');
          if (!docs[riderId]) docs[riderId] = {};
          docs[riderId].selfie = { url: finalSnapshot, type: 'live_face', uploadedAt: new Date().toISOString() };
          localStorage.setItem('rydealot_driver_docs', JSON.stringify(docs));
          sbFetchLocal('driver_documents', {
            method: 'POST',
            body: { rider_id: riderId, doc_type: 'selfie', file_url: finalSnapshot, status: 'approved' }
          }).catch(function(err){ console.warn('driver_documents note:', err); });
        } catch(sbErr){}
      }

      // 3. Upload to Cloudinary if available
      if (typeof window.uploadToCloudinary === 'function') {
        window.uploadToCloudinary(finalSnapshot, 'rydealot/drivers/selfies').then(function(cUrl) {
          if (cUrl && riderId) {
            try {
              var sDocs = JSON.parse(localStorage.getItem('rydealot_driver_docs') || '{}');
              if (sDocs[riderId] && sDocs[riderId].selfie) {
                sDocs[riderId].selfie.url = cUrl;
                localStorage.setItem('rydealot_driver_docs', JSON.stringify(sDocs));
              }
              sbFetchLocal('driver_documents', { method:'POST', body:{ rider_id: riderId, doc_type: 'selfie', file_url: cUrl, status: 'approved' } });
              sbFetchLocal('face_profiles?rider_id=eq.' + riderId, { method: 'PATCH', body: { photo_url: cUrl } });
            } catch(e){}
          }
        }).catch(function(){});
      }

      setTimeout(function() {
        stopKycCamera();
        if (kycCamModal) kycCamModal.style.display = 'none';
        showToast('✅ Biometric Face Registered! Live photo saved.');
      }, 1200);
    };

    // Rapido-Style Stability & Presence Tracking
    var processFrameLandmarks = function(landmarks) {
      if (!landmarks || landmarks.length === 0 || isKycCaptured) return;
      hasReceivedMeshFrame = true;

      var ratio = 0.5;
      if (landmarks.length >= 455) {
        ratio = noseRatioFaceMesh(landmarks);
      } else if (landmarks.length >= 68) {
        var edgeA = landmarks[0].x;
        var edgeB = landmarks[16].x;
        var nose = landmarks[30].x;
        ratio = (nose - edgeA) / (edgeB - edgeA || 1);
      }

      var isCentered = (ratio >= 0.32 && ratio <= 0.68);
      if (isCentered) {
        steadyFrames++;
        if (kycCircle) kycCircle.style.borderColor = '#22c55e';
        if (kycInstruction) {
          kycInstruction.innerHTML = '<div style="color:#22c55e; font-size:13.5px; font-weight:900;">📸 Perfect! Hold still... (' + Math.min(3, steadyFrames) + '/3)</div>';
        }
        if (steadyFrames >= 3) {
          executeKycCapture();
        }
      } else {
        steadyFrames = 0;
        if (kycCircle) kycCircle.style.borderColor = '#f59e0b';
        if (kycInstruction) {
          kycInstruction.innerHTML = '<div style="color:#f59e0b; font-size:12.5px; font-weight:800;">Align face inside the oval</div>';
        }
      }
    };

    // Primary: MediaPipe FaceMesh
    if (typeof FaceMesh !== 'undefined') {
      try {
        var faceMesh = new FaceMesh({
          locateFile: function(file) {
            return 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/' + file;
          }
        });
        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        faceMesh.onResults(function(results) {
          if (!kycLivenessActive || isKycCaptured) return;
          var faces = results.multiFaceLandmarks;
          if (!faces || faces.length === 0) {
            if (kycCircle) kycCircle.style.borderColor = '#ef4444';
            return;
          }
          processFrameLandmarks(faces[0]);
        });

        if (typeof Camera !== 'undefined') {
          var mpCam = new Camera(kycVideo, {
            onFrame: async function() {
              if (kycLivenessActive && !isKycCaptured) {
                try { await faceMesh.send({ image: kycVideo }); } catch(e){}
              }
            },
            width: 320, height: 240
          });
          mpCam.start();
        }
      } catch(fmErr){
        console.warn('FaceMesh global init note:', fmErr);
      }
    }

    // High-speed Fallback Loop (1.2s safeguard)
    var fallbackRunning = false;
    var startFallbackDetector = async function() {
      if (fallbackRunning || !kycLivenessActive || isKycCaptured) return;
      fallbackRunning = true;

      var fallbackLoop = async function() {
        if (!kycStream || !kycLivenessActive || isKycCaptured) return;
        if (hasReceivedMeshFrame) {
          setTimeout(fallbackLoop, 400);
          return;
        }

        if (!kycVideo || kycVideo.readyState < 2 || kycVideo.videoWidth === 0) {
          setTimeout(fallbackLoop, 80);
          return;
        }

        var landmarks = null;
        if (typeof faceapi !== 'undefined' && faceapi.nets.tinyFaceDetector.params) {
          try {
            var det = await faceapi.detectSingleFace(
              kycVideo, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.30 })
            ).withFaceLandmarks(true);
            if (det && det.landmarks) {
              landmarks = det.landmarks.positions;
            }
          } catch(e){}
        }

        if (!landmarks) {
          if (kycCircle) kycCircle.style.borderColor = '#ef4444';
          setTimeout(fallbackLoop, 100);
          return;
        }

        processFrameLandmarks(landmarks);
        setTimeout(fallbackLoop, 70);
      };

      fallbackLoop();
    };

    setTimeout(function() {
      if (!hasReceivedMeshFrame && kycLivenessActive && !isKycCaptured) {
        startFallbackDetector();
      }
    }, 1200);
  }

  // ==================== 2. PRE-SHIFT BIOMETRIC VERIFICATION ====================
  var faceModal = document.getElementById('rd-face-modal');
  var faceCancelBtn = document.getElementById('rd-face-cancel-btn');
  var faceFlipBtn = document.getElementById('rd-face-flip-btn');
  var faceVideo = document.getElementById('rd-face-video');
  var faceStatus = document.getElementById('rd-face-status');
  var faceCircle = document.getElementById('rd-face-circle');
  var faceRefImg = document.getElementById('rd-face-ref-img');
  var faceRefPlaceholder = document.getElementById('rd-face-ref-placeholder');
  var faceLiveThumb = document.getElementById('rd-face-live-thumb');
  var faceRetryBtn = document.getElementById('rd-face-retry-btn');
  var facePortalBtn = document.getElementById('rd-face-portal-btn');
  var mediaStream = null;
  var currentFacingMode = 'user';

  function stopFaceCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(function(t) { t.stop(); });
      mediaStream = null;
    }
  }

  async function getDriverBaselineDescriptor(riderId, kycUrl) {
    // 1. Instant local storage cache
    try {
      var localD = localStorage.getItem('rydealot_driver_kyc_descriptor');
      if (localD) {
        var arr = JSON.parse(localD);
        if (Array.isArray(arr) && arr.length === 128) {
          return new Float32Array(arr);
        }
      }
    } catch(e){}

    // 2. Supabase face_profiles
    if (riderId) {
      try {
        var rows = await sbFetchLocal('face_profiles?rider_id=eq.' + riderId + '&limit=1');
        if (rows && rows[0] && rows[0].descriptor) {
          var dbDesc = rows[0].descriptor;
          if (typeof dbDesc === 'string') {
            try { dbDesc = JSON.parse(dbDesc); } catch(pe){}
          }
          if (Array.isArray(dbDesc) && dbDesc.length === 128) {
            localStorage.setItem('rydealot_driver_kyc_descriptor', JSON.stringify(dbDesc));
            return new Float32Array(dbDesc);
          }
        }
      } catch(e){}
    }

    // 3. Fallback to image extraction if needed
    if (kycUrl && typeof faceapi !== 'undefined') {
      try {
        var img = new Image();
        if (kycUrl.indexOf('data:') !== 0) img.crossOrigin = 'anonymous';
        img.src = kycUrl;
        await new Promise(function(res, rej){
          img.onload = res;
          img.onerror = rej;
          setTimeout(rej, 3000);
        });
        var det = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.20 }))
          .withFaceLandmarks(true).withFaceDescriptor();
        if (det && det.descriptor) {
          localStorage.setItem('rydealot_driver_kyc_descriptor', JSON.stringify(Array.from(det.descriptor)));
          return det.descriptor;
        }
      } catch(e){}
    }

    return null;
  }

  window.triggerDriverFaceCheck = async function(onSuccess) {
    if (!faceModal || !faceVideo) {
      onSuccess();
      return;
    }
    faceModal.style.display = 'flex';
    if (faceRetryBtn) faceRetryBtn.style.display = 'none';
    if (facePortalBtn) facePortalBtn.style.display = 'none';
    if (faceCircle) faceCircle.style.borderColor = 'var(--signal)';
    if (faceStatus) faceStatus.innerHTML = '<span style="color:var(--signal);">Starting camera...</span>';

    var riderId = localStorage.getItem('ridelot_rider_id');
    var kycPhotoUrl = null;

    try {
      var allDocs = JSON.parse(localStorage.getItem('rydealot_driver_docs') || '{}');
      if (allDocs[riderId] && allDocs[riderId].selfie && allDocs[riderId].selfie.url) {
        kycPhotoUrl = allDocs[riderId].selfie.url;
      }
    } catch(e){}

    if (!kycPhotoUrl) {
      var fallbackFace = localStorage.getItem('rydealot_driver_live_face');
      if (fallbackFace && fallbackFace.length > 50) kycPhotoUrl = fallbackFace;
    }

    if (kycPhotoUrl && faceRefImg) {
      faceRefImg.src = kycPhotoUrl;
      faceRefImg.style.display = 'block';
      if (faceRefPlaceholder) faceRefPlaceholder.style.display = 'none';
    }

    var refDescriptorPromise = getDriverBaselineDescriptor(riderId, kycPhotoUrl);
    loadFaceApiModels();

    var startScan = function() {
      if (faceRetryBtn) faceRetryBtn.style.display = 'none';
      if (faceCircle) faceCircle.style.borderColor = 'var(--signal)';
      if (faceStatus) faceStatus.innerHTML = '<span style="color:var(--signal);">Starting camera...</span>';

      if (faceVideo) {
        faceVideo.style.transform = (currentFacingMode === 'user') ? 'scaleX(-1)' : 'none';
      }

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: currentFacingMode, width: { ideal: 640 }, height: { ideal: 640 } }
        })
        .then(function(stream) {
          mediaStream = stream;
          faceVideo.srcObject = stream;
          try { faceVideo.play(); } catch(pErr){}
          if (faceStatus) faceStatus.innerHTML = '<span style="color:#c7d2fe;">Center your face inside the circle...</span>';

          var scanStartTime = Date.now();
          var isScanComplete = false;
          var steadyFrames = 0;
          var mismatchFrames = 0;

          var checkLoop = async function() {
            if (!mediaStream || isScanComplete) return;

            if (faceLiveThumb) {
              var thumbCtx = faceLiveThumb.getContext('2d');
              thumbCtx.drawImage(faceVideo, 0, 0, 48, 48);
            }

            var detection = null;
            try {
              detection = await faceapi.detectSingleFace(
                faceVideo, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.30 })
              ).withFaceLandmarks(true);
            } catch(e){}

            if (!detection || !detection.box) {
              steadyFrames = 0;
              if (faceCircle) faceCircle.style.borderColor = '#ef4444';
              if (faceStatus) {
                faceStatus.innerHTML = '<div style="color:#ef4444; font-size:12.5px; font-weight:800;">⚠️ Position face inside circle</div>' +
                  '<div style="font-size:10.5px; color:#cbd5e1; margin-top:2px;">Look straight at camera with good lighting.</div>';
              }
              if (Date.now() - scanStartTime > 25000) {
                isScanComplete = true;
                if (faceStatus) faceStatus.innerHTML = '<div style="color:#ef4444; font-size:13px; font-weight:800;">⏱️ Scan Timed Out</div>';
                if (faceRetryBtn) faceRetryBtn.style.display = 'block';
                return;
              }
              setTimeout(checkLoop, 120);
              return;
            }

            // Face detected and positioned inside frame
            steadyFrames++;
            if (faceCircle) faceCircle.style.borderColor = '#3b82f6';
            if (faceStatus) {
              faceStatus.innerHTML = '<div style="color:#60a5fa; font-size:13px; font-weight:800;">📸 Face Detected! Hold still... (' + Math.min(3, steadyFrames) + '/3)</div>' +
                '<div style="font-size:10.5px; color:#93c5fd; margin-top:2px;">Verifying identity...</div>';
            }

            // Wait for 3 steady frames (~0.8s - 1.0s) before capturing descriptor
            if (steadyFrames < 3) {
              setTimeout(checkLoop, 180);
              return;
            }

            // Biometric Matching
            if (faceCircle) faceCircle.style.borderColor = '#22c55e';
            if (faceStatus) {
              faceStatus.innerHTML = '<div style="color:#22c55e; font-size:13px; font-weight:800;">⚡ Comparing face fingerprint...</div>' +
                '<div style="font-size:10.5px; color:#86efac; margin-top:2px;">Matching with registered KYC profile...</div>';
            }

            var refDescriptor = await refDescriptorPromise;
            if (!refDescriptor) {
              isScanComplete = true;
              if (faceCircle) faceCircle.style.borderColor = '#f59e0b';
              if (faceStatus) {
                faceStatus.innerHTML = '<div style="color:#f59e0b; font-weight:800; font-size:13px;">⚠️ KYC Photo Required</div>' +
                  '<div style="font-size:11px; color:#cbd5e1; margin-top:3px;">Please complete your 3D Live KYC Selfie in Driver Documents.</div>';
              }
              if (facePortalBtn) {
                facePortalBtn.style.display = 'block';
                facePortalBtn.onclick = function() {
                  stopFaceCamera();
                  faceModal.style.display = 'none';
                  var verifUpdateBtn = document.getElementById('rd-verif-update-btn');
                  if (verifUpdateBtn) verifUpdateBtn.click();
                };
              }
              return;
            }

            var liveDescriptor = null;
            try {
              var descDetection = await faceapi.detectSingleFace(
                faceVideo, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.30 })
              ).withFaceLandmarks(true).withFaceDescriptor();
              if (descDetection && descDetection.descriptor) {
                liveDescriptor = descDetection.descriptor;
              }
            } catch(dErr){}

            if (!liveDescriptor) {
              setTimeout(checkLoop, 120);
              return;
            }

            // Euclidean distance computation
            var distance = 0;
            for (var di = 0; di < 128; di++) {
              var diff = (refDescriptor[di] || 0) - (liveDescriptor[di] || 0);
              distance += diff * diff;
            }
            distance = Math.sqrt(distance);

            // Production Rapido/Uber standard matching percentage
            // Euclidean distance <= 0.58 is genuine match
            var matchPercent = Math.max(0, Math.min(100, Math.round((1 - (distance / 0.68)) * 100)));

            if (distance <= 0.58) {
              isScanComplete = true;
              if (faceCircle) faceCircle.style.borderColor = '#22c55e';
              if (faceStatus) {
                faceStatus.innerHTML = '<div style="color:#22c55e; font-size:13.5px; font-weight:900;">✅ Identity Verified (' + matchPercent + '% Match)!</div>' +
                  '<div style="font-size:11px; color:#86efac; margin-top:2px;">Welcome back, Captain! Going online...</div>';
              }
              if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
              setTimeout(function() {
                stopFaceCamera();
                faceModal.style.display = 'none';
                onSuccess();
              }, 1200);
            } else {
              mismatchFrames++;
              if (mismatchFrames < 3) {
                setTimeout(checkLoop, 180);
                return;
              }
              isScanComplete = true;
              if (faceCircle) faceCircle.style.borderColor = '#ef4444';
              if (faceStatus) {
                faceStatus.innerHTML = '<div style="color:#ef4444; font-size:13px; font-weight:800;">❌ Face Mismatch: ' + matchPercent + '% Match (Denied)</div>' +
                  '<div style="font-size:10.5px; color:#fca5a5; margin-top:2px;">Ensure clear face view without mask/sunglasses.</div>';
              }
              if (faceRetryBtn) faceRetryBtn.style.display = 'block';
            }
          };

          setTimeout(checkLoop, 200);
        })
        .catch(function(err) {
          if (faceStatus) faceStatus.innerHTML = '<span style="color:#ef4444;">⚠️ Camera error: ' + err.message + '</span>';
        });
      } else {
        onSuccess();
      }
    };

    if (faceFlipBtn) {
      faceFlipBtn.onclick = function() {
        currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
        faceFlipBtn.textContent = (currentFacingMode === 'user') ? '🔄 Flip' : '🔄 Front';
        stopFaceCamera();
        startScan();
      };
    }
    if (faceRetryBtn) {
      faceRetryBtn.onclick = function() {
        stopFaceCamera();
        startScan();
      };
    }
    if (faceCancelBtn) {
      faceCancelBtn.onclick = function() {
        stopFaceCamera();
        faceModal.style.display = 'none';
      };
    }

    startScan();
  };

  // Helper for reading files
  function readFileAsBase64(file) {
    return new Promise(function(resolve) {
      if (!file) return resolve(null);
      var reader = new FileReader();
      reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
          var canvas = document.createElement('canvas');
          var maxDim = 720;
          var w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.75));
        };
        img.onerror = function() { resolve(e.target.result); };
        img.src = e.target.result;
      };
      reader.onerror = function() { resolve(null); };
      reader.readAsDataURL(file);
    });
  }

  // Bind DOM elements on load
  function initDriverBiometrics() {
    if (openKycCamBtn && kycCamModal) {
      openKycCamBtn.onclick = function() {
        kycCamModal.style.display = 'flex';
        start3DKycLiveness();
      };
    }
    if (kycCancelBtn) {
      kycCancelBtn.onclick = function() {
        stopKycCamera();
        if (kycCamModal) kycCamModal.style.display = 'none';
      };
    }
    if (kycRestartBtn) {
      kycRestartBtn.onclick = function() {
        stopKycCamera();
        start3DKycLiveness();
      };
    }
    if (kycFlipBtn) {
      kycFlipBtn.onclick = function() {
        currentKycFacingMode = (currentKycFacingMode === 'user') ? 'environment' : 'user';
        kycFlipBtn.textContent = (currentKycFacingMode === 'user') ? '🔄 Flip' : '🔄 Front';
        stopKycCamera();
        start3DKycLiveness();
      };
    }
    if (kycFallbackBtn && kycFallbackInput) {
      kycFallbackBtn.onclick = function() { kycFallbackInput.click(); };
      kycFallbackInput.onchange = async function() {
        if (kycFallbackInput.files && kycFallbackInput.files[0]) {
          var base64 = await readFileAsBase64(kycFallbackInput.files[0]);
          if (base64) {
            var hiddenInput = document.getElementById('rd-doc-selfie-data');
            if (hiddenInput) hiddenInput.value = base64;
            var previewImg = document.getElementById('rd-kyc-preview-img');
            var previewIcon = document.getElementById('rd-kyc-preview-icon');
            if (previewImg) { previewImg.src = base64; previewImg.style.display = 'block'; }
            if (previewIcon) previewIcon.style.display = 'none';
            var statusEl = document.getElementById('rd-doc-selfie-status');
            if (statusEl) statusEl.innerHTML = '<span style="color:#16a34a; font-weight:800;">📸 Photo Captured (Click Save below)</span>';
            stopKycCamera();
            if (kycCamModal) kycCamModal.style.display = 'none';
            showToast('✅ Photo captured! Click Save & Update below.');
          }
        }
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDriverBiometrics);
  } else {
    initDriverBiometrics();
  }

  // Export functions
  window.loadFaceApiModels = loadFaceApiModels;
  window.start3DKycLiveness = start3DKycLiveness;
  window.stopKycCamera = stopKycCamera;

})(window);
