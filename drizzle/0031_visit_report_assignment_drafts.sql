-- Assignment opens the report; only actual completion starts its deadline.
ALTER TABLE fleet_trip_reports ALTER COLUMN due_at DROP NOT NULL;
ALTER TABLE fleet_trip_reports ADD COLUMN IF NOT EXISTS draft jsonb;
