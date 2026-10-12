# 🚀 Rydealot — Official Google Play Store Listing Kit

All assets, package files, and store descriptions prepared for publishing to the Google Play Console.

---

## 1. Core Listing Details

* **App Title (Max 30 chars):**
  ```text
  Rydealot: Bike Taxi & Maps
  ```
  *(Alternative: `Rydealot — Rides & Supermaps`)*

* **Short Description (Max 80 chars):**
  ```text
  Fast bike taxi rides, doorstep parcel delivery & offline vector Supermaps.
  ```

* **Category:**
  `Maps & Navigation` *(Primary)* or `Travel & Local` *(Secondary)*

* **Tags:**
  `Bike Taxi`, `Navigation`, `Offline Maps`, `Courier Delivery`, `Ride Sharing`

---

## 2. Full Store Description (Copy-Paste Ready)

```text
Welcome to Rydealot — India's high-speed bike taxi, instant parcel delivery, and vector offline Supermaps engine designed for real Indian roads.

Whether navigating signal dead-zones in rural villages or beating rush-hour city traffic, Rydealot gets you there faster, cheaper, and cooler.

🛵 1. FAST BIKE TAXI & AUTO BOOKING
• Instant pickup with verified local Captains.
• Transparent pricing with zero hidden surge rates.
• Real-time GPS ride tracking with Screen WakeLock so your display stays active throughout the journey.
• Built-in emergency SOS and live trip sharing.

🗺️ 2. RYDEALOT SUPERMAPS — THE MAP THAT NEVER DIES
• High-performance 60 FPS vector map powered by local PMTiles.
• True Signal Dead-Zone Navigation: Keep navigating smoothly even when 4G/5G drops to zero signal.
• Road Surface Indicators: Instantly identify Tar, Cement, and Mud paths before driving.
• ⚡ Power Saver Mode: True AMOLED Black (#000000) display mode with flat 2D rendering to prevent phone heating on 50–100 km rides.
• 📶 Data Saver Mode: Low-bandwidth route calculation saving up to 90% mobile data on highways.

📸 3. DOORSTEP VISUAL VERIFICATION (PRIVATE IN-LINK SHARING)
• Never get lost looking for the right gate, shop, or colony house!
• Attach a doorstep photo, nameplate snap, or landmark clue to your location link.
• 100% In-Link Privacy: Zero cloud storage, zero database records. The photo lives entirely inside your WhatsApp link.
• Automatic 100-Meter Arrival Popup: As Captains enter the final 100 meters, the doorstep photo automatically appears on screen for effortless doorstep arrival.

📦 4. SAGE PARCEL DELIVERY
• Send parcels, documents, gifts, or forgotten keys across town in minutes.
• Doorstep photo verification at pickup and drop.
• Live parcel tracking from sender to recipient.

🔒 5. PRIVACY & SAFETY FIRST
• End-to-end encrypted sessions with verified phone authentication.
• Easy one-tap account and data deletion at any time.
• Full compliance with Google Play safety and user privacy guidelines.

Download Rydealot today and experience the next generation of Indian mobility!

Website: https://www.rydealot.com
Support & Queries: support@rydealot.com
Privacy Policy: https://www.rydealot.com/privacy.html
Account Deletion: https://www.rydealot.com/delete-account.html
```

---

## 3. Play Store Graphics & Upload Files

| Asset | File Location in Project | Specs |
| :--- | :--- | :--- |
| **App Icon** | `icon-512.png` | `512 × 512 px` (PNG, 32-bit, max 1MB) |
| **Feature Graphic Banner** | `assets/playstore-feature-graphic-1024x500.png` | `1024 × 500 px` (PNG, exact Play Store ratio) |
| **Screenshot 1 (Home/Booking)** | `assets/playstore-screenshots/1_home_1080x2400.png` | `1080 × 2400 px` |
| **Screenshot 2 (Supermaps)** | `assets/playstore-screenshots/2_supermaps_1080x2400.png` | `1080 × 2400 px` |
| **Screenshot 3 (Parcel/Sage)** | `assets/playstore-screenshots/3_parcel_sage_1080x2400.png` | `1080 × 2400 px` |
| **Production App Bundle (.aab)**| `Rydealot - Google Play package (1)/Rydealot.aab` | Signed Release Bundle (Target SDK 34+) |
| **Keystore File** | `Rydealot - Google Play package (1)/signing.keystore` | Password: `tPXjfxBjwfS1` (Alias: `my-key-alias`) |

---

## 4. Policy URLs

* **Privacy Policy URL:** `https://www.rydealot.com/privacy.html`
* **Account Deletion URL:** `https://www.rydealot.com/delete-account.html`
* **Digital Asset Links:** `https://www.rydealot.com/.well-known/assetlinks.json`

---

## 5. Google Play Console Setup Steps

1. **Account Registration ($25 USD):**
   * Register as an **Organization** at `https://play.google.com/console/signup`.
   * Provide your **D-U-N-S Number** (obtained for free using your MSME Udyam Certificate).
   * Pay the $25 one-time fee with an international Visa/Mastercard.
2. **Create App:**
   * App name: `Rydealot: Bike Taxi & Maps`
   * Default language: `English (India)`
   * App or game: `App`
   * Free or paid: `Free`
3. **Store Presence:**
   * Upload `icon-512.png` (App Icon).
   * Upload `assets/playstore-feature-graphic-1024x500.png` (Feature Graphic).
   * Upload the screenshots from `assets/playstore-screenshots/`.
   * Paste Short Description and Full Description from Section 1 & 2 above.
4. **App Content:**
   * Privacy Policy URL: `https://www.rydealot.com/privacy.html`
   * App Access: `All functionality is available without restrictions`
   * Ads: `No, my app does not contain ads`
   * Target Age: `18 and over`
   * Financial Features: `No financial features`
   * Location: Select `Background Location` (for active ride tracking & driver GPS navigation).
5. **Production Release:**
   * Go to `Production` ➡️ `Create new release`.
   * Drop in `Rydealot - Google Play package (1)/Rydealot.aab`.
   * Click `Next` ➡️ `Save` ➡️ `Review and Roll out to Production`!
