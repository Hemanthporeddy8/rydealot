-- Run this in Postgres / Supabase SQL editor:

-- 1. OTP Codes Table
create table if not exists otp_codes (
  id            bigserial primary key,
  email         text not null,
  code_hash     text not null,      -- OTP is stored hashed, never in plain text
  attempts      int  not null default 0,
  expires_at    timestamptz not null,
  consumed      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_otp_codes_email on otp_codes(email);

-- 2. Users Table (Self-hosted app users)
create table if not exists app_users (
  id            bigserial primary key,
  email         text unique not null,
  full_name     text,
  phone         text,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

-- 3. Rydealot Sage (Bike Parcel Delivery Table)
create table if not exists sage_parcels (
  id                  uuid default gen_random_uuid() primary key,
  sender_name         text not null,
  sender_phone        text not null,
  receiver_name       text not null,
  receiver_phone      text not null,
  package_category    text default 'documents', -- documents, food, keys, medicine, clothes, box
  package_weight_kg   numeric default 2.0,
  pickup_address      text not null,
  pickup_lat          numeric,
  pickup_lng          numeric,
  drop_address        text not null,
  drop_lat            numeric,
  drop_lng            numeric,
  fare                numeric not null,
  permanent_ride_pin  text,
  status              text default 'pending', -- pending, accepted, picked_up, in_transit, delivered, cancelled
  driver_id           text,
  driver_name         text,
  driver_phone        text,
  driver_vehicle      text,
  notes               text,
  created_at          timestamptz not null default now()
);
create index if not exists idx_sage_parcels_status on sage_parcels(status);
