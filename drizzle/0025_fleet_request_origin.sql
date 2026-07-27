-- 0025_fleet_request_origin.sql
DO $$ BEGIN
  CREATE TYPE fleet_origin_kind AS ENUM ('head_office','property','other');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TABLE fleet_requests
  ADD COLUMN IF NOT EXISTS origin_kind fleet_origin_kind NOT NULL DEFAULT 'head_office';
--> statement-breakpoint
ALTER TABLE fleet_requests
  ADD COLUMN IF NOT EXISTS origin_property_id uuid REFERENCES properties(id) ON DELETE SET NULL;
