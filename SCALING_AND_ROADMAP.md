# Rydealot Architecture Roadmap: Scaling from Launch to 1M Daily Rides

## Executive Summary
This document records the architectural roadmap, cost analysis, and feature roadmap discussed for **Rydealot** (Bike Taxi, Sage Parcel Delivery, and Along With Cargo Freight).

---

## 1. Scale Phases & Technology Architecture

### Phase 1: Prototype, Pilot Launch & Validation (0 - 3,000 Daily Rides)
- **Database & Auth:** Supabase (Managed PostgreSQL)
- **Maps & Routing:** Leaflet.js + CartoDB Voyager / OpenStreetMap tiles + OSRM Road Routing
- **Realtime GPS:** Supabase Realtime Broadcast WebSockets (Peer-to-peer ephemeral streaming, no DB bloat)
- **Frontend Hosting:** Cloudflare Pages / GitHub Pages
- **Monthly Cost:** **₹0 / Free Tier**
  - Up to 50,000 Monthly Active Users
  - 500 MB DB (~1,000,000 ride & parcel rows)
  - 500 simultaneous live map tracking connections

### Phase 2: Growth & City-wide Expansion (3,000 - 50,000 Daily Rides)
- **Database:** Supabase Pro ($25/mo) / Self-Hosted Supabase on Cloud VPS (Hetzner / DigitalOcean)
- **Edge Acceleration:** Cloudflare Hyperdrive / Cloudflare Workers
- **Monthly Cost:** **~₹2,000 to ₹5,000 / month**
  - Up to 100,000+ Active Users
  - 8 GB+ PostgreSQL storage (16,000,000+ ride records)
  - 10,000 simultaneous live tracking connections

### Phase 3: Enterprise Scale (1,000,000+ Daily Rides - Rapido/Uber Level)
- **Target Metrics:** 1M rides/day (30M rides/mo), ~₹120 Crores Gross Merchandise Value (GMV), ~₹18 Crores platform revenue/month (at 15% take-rate).
- **Core Cloud:** AWS Mumbai Region (`ap-south-1`)
  - **AWS EKS (Kubernetes):** 10-20 auto-scaling container nodes running Go (Golang) microservices for low-latency ride matching (~₹2.5L/mo).
  - **AWS ElastiCache (Redis Cluster):** In-memory RAM storage handling ~70,000 driver GPS pings/second with H3/S2 spatial indexing (~₹1.2L/mo).
  - **AWS MSK (Managed Apache Kafka):** High-throughput event queues for bookings, surge pricing, payments (~₹80k/mo).
  - **AWS Aurora PostgreSQL:** Enterprise distributed DB with auto-scaling read replicas (~₹2.0L/mo).
  - **Cloudflare Enterprise:** DDoS protection, global CDN edge, SSL (~₹60k/mo).
  - **OTP & Communication Gateway:** Exotel / Twilio (~₹3.0L/mo).
- **Total Infrastructure Cost:** **~₹8.5 Lakhs - ₹12.5 Lakhs / month** (< 1% of revenue).

---

## 2. Feature Roadmap: What We Were Discussing Right Before the Database

Right before discussing database scale, we agreed on the **Two-Way Handshake Security System** for **Sage Parcels & Trucks**:

### Feature 1: The Two PINs (Sender PIN + Receiver PIN)
1. **Sender Pickup PIN (Permanent/App PIN):**
   - Sender gives this PIN to the captain at the pickup door.
   - Captain enters it -> Parcel status moves to `in_transit`.
2. **Receiver Delivery PIN (Optional Toggle for Sender):**
   - On `sage.html`, sender can toggle: *"🔒 Require Receiver PIN for Handover"*.
   - If receiver has Rydealot, it verifies their own app PIN. If not, generates a 4-digit code.
   - Captain **cannot** mark "Delivered" until the receiver gives this PIN at their door.

### Feature 2: Receiver Live Tracking Page (`track.html?id=...`)
- Generates a shareable WhatsApp / SMS tracking link for the receiver.
- Receiver can watch the captain's bike moving live on Leaflet map in real time (Zero database storage, pure WebSocket broadcast).
- Shows Captain Name, Phone, Vehicle Number, and Drop PIN.

### Feature 3: Admin Kill Switches / Feature Flags
- Ability in `admin.html` to pause/disable **Bike Taxis** independently if a specific state introduces temporary regulatory restrictions, while keeping **Sage Parcels** and **Cargo Trucks** running 100% uninterrupted.
