-- 0023_fixed_asset_registry.sql
DO $$ BEGIN
  CREATE TYPE asset_category AS ENUM ('ffe','machinery','kitchen','it','vehicles');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE asset_status AS ENUM ('active','in_repair','missing','disposed');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE maintenance_status AS ENUM ('pending','resolved');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rooms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  floor_level text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT rooms_property_name_unique UNIQUE (property_id, name)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS assets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_code text NOT NULL UNIQUE,
  name text NOT NULL,
  category asset_category NOT NULL,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  purchase_date date NOT NULL,
  purchase_cost numeric(12,2) NOT NULL,
  useful_life_years integer NOT NULL,
  salvage_value numeric(12,2) DEFAULT 0 NOT NULL,
  status asset_status DEFAULT 'active' NOT NULL,
  serial_number text,
  vendor_name text,
  warranty_expiry date,
  image_url text,
  qr_url text UNIQUE,
  last_audited_at timestamptz,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS assets_property_idx ON assets(property_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS assets_room_idx ON assets(room_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS maintenance_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  reported_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  service_date date,
  issue_description text NOT NULL,
  repair_cost numeric(12,2),
  resolution_status maintenance_status DEFAULT 'pending' NOT NULL,
  resolved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS maintenance_logs_asset_idx ON maintenance_logs(asset_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS asset_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  detail text,
  created_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS asset_events_asset_idx ON asset_events(asset_id);
