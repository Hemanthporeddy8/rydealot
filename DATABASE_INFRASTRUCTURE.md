# 🛡️ Rydealot Multi-Cloud Database & Infrastructure Master Record

This document is the **single source of truth** for all database connections, failover engines, storage buckets, and business credentials for Rydealot. 

---

## 🏢 Business Identity & Registrations
- **Enterprise Name:** RYDEALOT
- **Owner / Founder:** Hemanth Poreddy
- **Udyam Registration Number:** `UDYAM-TS-31-0062572` (Telangana, India)
- **JanSamarth Application ID:** `ANS-PMMY-17715644-9587964` (Mudra Loan ₹48,000)
- **Primary Bank / Savings Account:** Indian Overseas Bank (IOB)
- **Email:** `Rydealotoffical@gmail.com`

---

## 🗄️ Multi-Cloud Database Topology

```
                                [ RYDEALOT CLIENTS ]
                       (Customer App / Driver App / Admin)
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
       [ PRIMARY (PLAN A) ]                            [ BACKUP (PLAN B) ]
      Supabase (PostgreSQL)                        Cloudflare D1 (Serverless SQL)
     Location: AWS Mumbai (ap-south-1)             Location: APAC (Asia-Pacific) Edge
     Status: Active (100%)                         Status: Active (100% Drop-in)
                 │                                               │
                 └───────────────────────┬───────────────────────┘
                                         │
                        [ IMAGE & LIVE TELEMETRY ENGINE ]
                                 Google Firebase
                   • Storage: rydealot-cff06.firebasestorage.app (5 GB Free)
                   • RTDB: rydealot-cff06-default-rtdb.firebaseio.com (Live GPS)
```

---

## 1. Plan A: Supabase (Primary Database)
- **Project URL:** `https://wupndimumeugfjxzejlj.supabase.co`
- **Anon Public API Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1cG5kaW11bWV1Z2ZqeHplamxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMDgwMDQsImV4cCI6MjA5NzY4NDAwNH0.dM6nG_cswzOAXuumW3LdfGJxxoF-Fn3iiVImUZ9as2Y`
- **Region:** AWS Mumbai (`ap-south-1`)
- **Tables Used:**
  - `bookings` (Customer rides & intercity trips)
  - `riders` (Captain accounts, vehicle details, live availability)
  - `sage_parcels` (15-min city parcel delivery orders)
  - `users` (Customer logins, passwords, emergency contacts)
  - `platform_services` (Master switches for Rides, Sage, Trucks, Goodz)
  - `driver_documents` (Captain KYC, licenses, vehicle RCs)
  - `fare_settings` (Base fare, per-km rates, night surge)
  - `map_coupons` (Promotional discount codes)

---

## 2. Plan B: Cloudflare D1 (Autonomous Mirror-Twin Backup)
- **Cloudflare Account ID:** `84c20835c9b5fa12c91ea25724f5488e`
- **D1 Database Name:** `rydealot-db`
- **D1 Database ID:** `ce594711-0b80-4304-8774-08c7414025ac`
- **Worker Gateway URL:** `https://rydealot-api.rydealotoffical.workers.dev`
- **Worker Name:** `rydealot-api`
- **API Token (Read/Write):** `cfut_C4zWBNde8u...5569fb` (Saved in Cloudflare Dashboard)
- **Binding Name:** `DB` (Bound to `rydealot-db`)
- **Engine Capabilities:** 
  - 100% PostgREST compliant drop-in emulator at `/rest/v1/:table`.
  - Supports all query operators: `eq`, `neq`, `gte`, `lte`, `in`, `order`, `limit`, `select`.
  - Supports `GET`, `POST` (upsert), `PATCH` (update), `DELETE`.
  - Dynamic JSON column support via SQLite `json_extract()`.

---

## 3. Storage & Telemetry: Google Firebase
- **Project ID:** `rydealot-cff06`
- **Auth Domain:** `rydealot-cff06.firebaseapp.com`
- **Realtime Database URL:** `https://rydealot-cff06-default-rtdb.firebaseio.com`
- **Storage Bucket:** `rydealot-cff06.firebasestorage.app` (5 GB Free KYC/Doc storage)
- **Role:** Handles high-frequency live GPS location pings (every 3 seconds) and driver document uploads without bloating SQL tables.

---

## 4. How Failover & Dual-Sync Operates
1. **Normal Flow (Plan A Healthy):**
   - Read/write executes on **Supabase** in ~25ms.
   - Any create, update, or delete (`POST`, `PATCH`, `DELETE`) is **silently mirrored to Cloudflare D1 in the background** (`keepalive: true`).
2. **Failover Flow (Plan A Down / 429 Quota / Timeout):**
   - The app intercepts the Supabase network/HTTP error in 200ms.
   - It fires the **identical request to `https://rydealot-api.rydealotoffical.workers.dev/rest/v1/...`**.
   - Cloudflare D1 returns the identical JSON array/object structure.
   - **Zero customer disruption.** Bookings continue, drivers continue receiving rides.

---

## 5. Plan B+ (AWS DynamoDB) & Plan C (Private Server) Roadmap
- **Plan B+ (AWS DynamoDB):** 25 GB permanent free storage in AWS Hyderabad (`ap-south-2`). Available when AWS ₹2 card verification is performed.
- **Plan C (Private Server / Old PC):** Local high-capacity cold storage connected via Cloudflare Tunnel (`cloudflared`) to archive old ride logs and high-volume GPS breadcrumbs for ₹0.
