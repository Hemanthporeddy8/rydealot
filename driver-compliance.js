// ============================================================================
// RYDEALOT DRIVER COMPLIANCE & PENALTY ENGINE (RAPIDO-ALIGNED)
// ============================================================================

(function(window) {
  'use strict';

  var COMPLIANCE_TIERS = {
    TIER_1: {
      id: 'tier_1',
      name: 'Tier 1: Operational Cooling-Off',
      durationHours: 2,
      badgeColor: '#f59e0b',
      label: '2 to 6 Hours'
    },
    TIER_2: {
      id: 'tier_2',
      name: 'Tier 2: Minor & Cash Policy Violations',
      durationHours: 24,
      badgeColor: '#f97316',
      label: '12 to 24 Hours (1 Day)'
    },
    TIER_3: {
      id: 'tier_3',
      name: 'Tier 3: Moderate Safety & Conduct',
      durationHours: 72, // 3 days
      badgeColor: '#ef4444',
      label: '3 to 7 Days'
    },
    TIER_4: {
      id: 'tier_4',
      name: 'Tier 4: High Severity Safety Violations',
      durationHours: 336, // 14 days
      badgeColor: '#dc2626',
      label: '14 to 30 Days'
    },
    TIER_5: {
      id: 'tier_5',
      name: 'Tier 5: Critical Safety & Fraud (Blacklist)',
      durationHours: null, // Permanent
      badgeColor: '#7f1d1d',
      label: 'Permanent Ban (Lifetime)'
    }
  };

  var VIOLATION_RULES = [
    // Tier 1
    {
      code: 'HIGH_CANCELLATIONS',
      title: 'High Cancellation Rate After Accepting',
      tier: 'TIER_1',
      defaultHours: 2,
      category: 'Operational',
      description: 'Frequently canceling trips after accepting customer ride requests.'
    },
    {
      code: 'IGNORING_REQUESTS',
      title: 'Repeatedly Ignoring Incoming Rides While Online',
      tier: 'TIER_1',
      defaultHours: 2,
      category: 'Operational',
      description: 'Staying online but refusing to accept incoming passenger dispatches.'
    },

    // Tier 2
    {
      code: 'EXTRA_CASH_DEMAND',
      title: 'Demanding Extra Cash Above Fare',
      tier: 'TIER_2',
      defaultHours: 24,
      category: 'Fare & Pricing',
      description: 'Asking passenger for extra cash or negotiation outside app pricing.'
    },
    {
      code: 'OFFLINE_PAYMENT_REQUEST',
      title: 'Asking Passenger to Cancel & Pay Offline',
      tier: 'TIER_2',
      defaultHours: 24,
      category: 'Policy Violation',
      description: 'Circumventing platform rides by proposing private offline rides.'
    },
    {
      code: 'NO_PASSENGER_HELMET',
      title: 'Not Providing Pillion Helmet to Passenger',
      tier: 'TIER_2',
      defaultHours: 12,
      category: 'Safety & Traffic',
      description: 'Failing to carry a clean helmet for the pillion passenger.'
    },
    {
      code: 'VEHICLE_PLATE_MISMATCH',
      title: 'Driving Unregistered Vehicle / Plate Mismatch',
      tier: 'TIER_2',
      defaultHours: 24,
      category: 'Vehicle Compliance',
      description: 'Arriving with a different bike or car than registered on profile.'
    },

    // Tier 3
    {
      code: 'RASH_DRIVING',
      title: 'Rash Driving / Dangerous Overspeeding',
      tier: 'TIER_3',
      defaultHours: 72, // 3 Days
      category: 'Safety & Traffic',
      description: 'Reported reckless riding, sudden braking, or exceeding speed limits.'
    },
    {
      code: 'CUSTOMER_MISBEHAVIOR',
      title: 'Rude Conduct / Verbal Argument with Customer',
      tier: 'TIER_3',
      defaultHours: 72,
      category: 'Conduct',
      description: 'Unprofessional behavior, offensive language, or customer arguments.'
    },
    {
      code: 'EXPIRED_DOCUMENTS',
      title: 'Expired Driving License / RC / Insurance',
      tier: 'TIER_3',
      defaultHours: 168, // 7 Days
      category: 'Documentation',
      description: 'Operating with expired government or vehicle certificates.'
    },
    {
      code: 'LOW_CUSTOMER_RATING',
      title: 'Consistent Low Rating (< 4.0 Stars)',
      tier: 'TIER_3',
      defaultHours: 72,
      category: 'Quality Standards',
      description: 'Driver rating dropped below acceptable safety/quality benchmark.'
    },

    // Tier 4
    {
      code: 'INTOXICATION_SUSPICION',
      title: 'Driving Under Influence (Alcohol / Drugs)',
      tier: 'TIER_4',
      defaultHours: 336, // 14 Days
      category: 'Critical Safety',
      description: 'Reported driving under the influence; suspended pending investigation.'
    },
    {
      code: 'RIDE_ABANDONMENT',
      title: 'Midway Ride Abandonment',
      tier: 'TIER_4',
      defaultHours: 336,
      category: 'Passenger Safety',
      description: 'Forcing passenger to get off midway before reaching destination.'
    },
    {
      code: 'REPEATED_DISPUTES',
      title: 'Multiple Repeated Violations (3rd Strike)',
      tier: 'TIER_4',
      defaultHours: 720, // 30 Days
      category: 'Platform Compliance',
      description: 'Driver reached 3rd disciplinary strike on platform.'
    },

    // Tier 5 (Permanent)
    {
      code: 'HARASSMENT_ASSAULT',
      title: 'Customer Harassment / Physical Altercation',
      tier: 'TIER_5',
      defaultHours: null,
      category: 'Criminal / Severe Safety',
      description: 'Physical violence, threatening behavior, or severe harassment.'
    },
    {
      code: 'FAKE_DOCUMENTS',
      title: 'Forged / Fake Government ID or License',
      tier: 'TIER_5',
      defaultHours: null,
      category: 'Fraud & Forgery',
      description: 'Uploading fake Aadhaar card, forged driving license, or invalid RC.'
    },
    {
      code: 'ACCOUNT_LENDING',
      title: 'Lending Driver Account to Unverified Third Party',
      tier: 'TIER_5',
      defaultHours: null,
      category: 'Security Breach',
      description: 'Allowing another individual to ride under registered profile.'
    },
    {
      code: 'GPS_SPOOFING_FRAUD',
      title: 'GPS Spoofing / Booking Ring Fraud',
      tier: 'TIER_5',
      defaultHours: null,
      category: 'Financial Fraud',
      description: 'Using mock location software to fabricate false trips and payouts.'
    }
  ];

  // Helper to calculate expiry date based on hours
  function calculateExpiryDate(hours) {
    if (!hours) return 'Permanent';
    var d = new Date();
    d.setTime(d.getTime() + (hours * 60 * 60 * 1000));
    var pad = function(n) { return n < 10 ? '0' + n : n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // Helper to format remaining time
  function getRemainingTimeText(isoString) {
    if (!isoString || isoString === 'Permanent') return 'Permanent Ban';
    var diff = new Date(isoString).getTime() - new Date().getTime();
    if (diff <= 0) return 'Expired (Ready to lift)';
    var days = Math.floor(diff / (1000 * 60 * 60 * 24));
    var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    var mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    var secs = Math.floor((diff % (1000 * 60)) / 1000);
    if (days > 0) return days + 'd ' + hours + 'h remaining';
    if (hours > 0) return hours + 'h ' + mins + 'm remaining';
    return mins + 'm ' + secs + 's remaining';
  }

  // Strike count helper
  function getDriverStrikeHistory(riderId) {
    var strikesMap = JSON.parse(localStorage.getItem('rydealot_driver_strikes') || '{}');
    return strikesMap[riderId] || [];
  }

  function addDriverStrike(riderId, violation) {
    var strikesMap = JSON.parse(localStorage.getItem('rydealot_driver_strikes') || '{}');
    if (!strikesMap[riderId]) strikesMap[riderId] = [];
    strikesMap[riderId].push({
      code: violation.code,
      title: violation.title,
      tier: violation.tier,
      at: new Date().toISOString()
    });
    localStorage.setItem('rydealot_driver_strikes', JSON.stringify(strikesMap));
    return strikesMap[riderId].length;
  }

  // Export to window
  window.RydealotCompliance = {
    TIERS: COMPLIANCE_TIERS,
    RULES: VIOLATION_RULES,
    calculateExpiryDate: calculateExpiryDate,
    getRemainingTimeText: getRemainingTimeText,
    getDriverStrikeHistory: getDriverStrikeHistory,
    addDriverStrike: addDriverStrike
  };

})(window);
