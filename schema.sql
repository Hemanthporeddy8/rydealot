-- Run this in Postgres / Supabase SQL editor to set up the OTP and Users tables:

create table if not exists otp_codes (
  id            bigserial primary key,
  email         text not null,
  code_hash     text not null,      -- OTP is stored hashed, never in plain text
  attempts      int  not null default 0,
  expires_at    timestamptz not null,
  consumed      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Speeds up "find latest active OTP for this email" lookups
create index if not exists idx_otp_codes_email on otp_codes(email);

-- Users table (Self-hosted app users)
create table if not exists app_users (
  id            bigserial primary key,
  email         text unique not null,
  full_name     text,
  phone         text,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);
