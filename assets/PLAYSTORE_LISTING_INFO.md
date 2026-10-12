# 🚀 Rydealot — Official Google Play Store Listing Kit

All assets, package files, and store descriptions prepared for publishing to the Google Play Console.

---

## 1. Core Listing Details

* **App Title (Max 30 chars):**
  ```text
  Rydealot: Supermaps & Parcels
  ```
  *(Alternative: `Rydealot Supermaps & Delivery`)*

* **Short Description (Max 80 chars):**
  ```text
  Offline vector navigation, private doorstep photo pin sharing & local parcels.
  ```

* **Category:**
  `Maps & Navigation` *(Primary)* or `Travel & Local` *(Secondary)*

* **Tags:**
  `Navigation`, `Offline Maps`, `GPS Tracker`, `Courier Delivery`, `Local Search`

---

## 2. Full Store Description (Copy-Paste Ready)

```text
Welcome to Rydealot — India's high-performance offline vector navigation, doorstep visual pin sharing, and instant local parcel delivery engine designed for real Indian roads.

Whether navigating signal dead-zones in rural villages or finding tricky colony addresses in busy cities, Rydealot gets you there faster, cooler, and with zero confusion.

🗺️ 1. RYDEALOT SUPERMAPS — THE MAP THAT NEVER DIES
• High-performance 60 FPS vector map powered by local PMTiles.
• True Signal Dead-Zone Navigation: Keep navigating smoothly even when 4G/5G drops to zero signal.
• Road Surface Indicators: Instantly identify Tar, Cement, and Mud paths before driving.
• ⚡ Power Saver Mode: True AMOLED Black (#000000) display mode with flat 2D rendering to prevent phone heating and battery drain on 50–100 km journeys.
• 📶 Data Saver Mode: Low-bandwidth route calculation saving up to 90% mobile data on highways.
• Intuitive Local Search: Find nearby places, stops, and destinations with instant offline caching.

📸 2. DOORSTEP VISUAL VERIFICATION (PRIVATE IN-LINK SHARING)
• Never get lost looking for the right gate, shop, or colony house!
• Attach a doorstep photo, nameplate snap, or landmark clue to your location link.
• 100% In-Link Privacy: Zero cloud storage, zero database records. The photo lives entirely inside your shared link.
• Automatic 100-Meter Arrival Popup: As drivers or visitors enter the final 100 meters, the doorstep photo automatically pops up on screen for effortless arrival.
• One-Tap Quick Share: Send directly via WhatsApp or standard Android share sheet.

📦 3. SAGE PARCEL DELIVERY
• Send parcels, documents, gifts, medicines, or forgotten keys across town in minutes.
• Doorstep photo verification at pickup and drop.
• Live parcel tracking from sender to recipient.
• Direct connection with verified local courier partners.

🔒 4. PRIVACY & SAFETY FIRST
• End-to-end encrypted sessions with verified phone authentication.
• In-link photo sharing that leaves zero digital footprint on servers.
• Easy one-tap account and data deletion at any time.
• Full compliance with Google Play user safety and data privacy policies.

Download Rydealot today and experience the next generation of Indian navigation and local deliveries!

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
| **Feature Graphic Banner** | `assets/playstore-feature-graphic-1024x500.png` | `1024 × 500 px` (PNG, official mascot + logo branding) |
| **Screenshots Folder** | `assets/playstore-screenshots/` | Drop your real mobile phone screenshots here (`1080 × 2400` or `1080 × 1920`, min 2 required) |
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
   * App name: `Rydealot: Supermaps & Parcels`
   * Default language: `English (India)`
   * App or game: `App`
   * Free or paid: `Free`
3. **Store Presence:**
   * Upload `icon-512.png` (App Icon).
   * Upload `assets/playstore-feature-graphic-1024x500.png` (Feature Graphic).
   * Upload your captured mobile phone screenshots from `assets/playstore-screenshots/`.
   * Paste Short Description and Full Description from Section 1 & 2 above.
4. **App Content:**
   * Privacy Policy URL: `https://www.rydealot.com/privacy.html`
   * App Access: `All functionality is available without restrictions`
   * Ads: `No, my app does not contain ads`
   * Target Age: `18 and over`
   * Financial Features: `No financial features`
   * Location: Select `Location` (for GPS navigation and turn-by-turn routing).
5. **Production Release:**
   * Go to `Production` ➡️ `Create new release`.
   * Drop in `Rydealot - Google Play package (1)/Rydealot.aab`.
   * Click `Next` ➡️ `Save` ➡️ `Review and Roll out to Production`!
