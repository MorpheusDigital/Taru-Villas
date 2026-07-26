-- 0024_fleet_command.sql
DO $$ BEGIN
  CREATE TYPE fleet_request_type AS ENUM ('visit','standalone');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE fleet_request_status AS ENUM ('pending','queued','dispatched','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE dispatch_status AS ENUM ('draft','approved','in_progress','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE vehicle_status AS ENUM ('active','maintenance','retired');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE driver_language AS ENUM ('en','si','ta');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  name varchar(255) NOT NULL,
  registration_no varchar(50),
  max_passengers integer NOT NULL,
  cargo_capable boolean DEFAULT false NOT NULL,
  is_restricted boolean DEFAULT false NOT NULL,
  status vehicle_status DEFAULT 'active' NOT NULL,
  current_location_property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT vehicles_org_name_unique UNIQUE (org_id, name)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS drivers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  full_name text NOT NULL,
  phone varchar(50),
  preferred_language driver_language DEFAULT 'en' NOT NULL,
  access_token varchar(32) NOT NULL UNIQUE,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS driver_vehicles (
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  CONSTRAINT driver_vehicles_pk UNIQUE (driver_id, vehicle_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS property_distances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  from_property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  to_property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  distance_km numeric(6,1) NOT NULL,
  drive_minutes integer,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT property_distances_pair_unique
    UNIQUE NULLS NOT DISTINCT (org_id, from_property_id, to_property_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS fleet_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL UNIQUE REFERENCES organizations(id),
  pooling_threshold_km numeric(6,1) DEFAULT 40.0 NOT NULL,
  planning_horizon_days integer DEFAULT 14 NOT NULL,
  engine_enabled boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS fleet_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  request_type fleet_request_type NOT NULL,
  requested_by uuid NOT NULL REFERENCES profiles(id),
  target_property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  origin_text text,
  destination_text text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  pax_count integer DEFAULT 1 NOT NULL,
  cargo_required boolean DEFAULT false NOT NULL,
  purpose text,
  notes text,
  status fleet_request_status DEFAULT 'pending' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fleet_requests_status_idx ON fleet_requests(status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fleet_requests_requested_by_idx ON fleet_requests(requested_by);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS dispatches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status dispatch_status DEFAULT 'draft' NOT NULL,
  generated_by varchar(16) DEFAULT 'engine' NOT NULL,
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  dispatched_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS dispatches_status_idx ON dispatches(status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS dispatches_driver_idx ON dispatches(driver_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS dispatch_stops (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatch_id uuid NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
  request_id uuid REFERENCES fleet_requests(id) ON DELETE SET NULL,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  label text,
  sort_order integer DEFAULT 0 NOT NULL,
  arrived_at timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS dispatch_stops_dispatch_idx ON dispatch_stops(dispatch_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES drivers(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now() NOT NULL,
  last_seen_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT push_subscriptions_one_owner CHECK (num_nonnulls(profile_id, driver_id) = 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES drivers(id) ON DELETE CASCADE,
  type varchar(50) NOT NULL,
  title text NOT NULL,
  body text,
  link_url text,
  channel varchar(16) DEFAULT 'in_app' NOT NULL,
  sent_at timestamptz,
  read_at timestamptz,
  delivery_error text,
  created_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notifications_profile_idx ON notifications(profile_id, read_at);
--> statement-breakpoint
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_fleet_admin boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_book_fleet boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_use_restricted_vehicles boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE profiles SET is_fleet_admin = true, can_book_fleet = true WHERE role = 'admin';
