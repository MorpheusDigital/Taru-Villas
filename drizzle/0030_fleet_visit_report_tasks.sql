-- Additive and compatible with the prior release. Existing reports retain
-- their original deadlines and task relationships; no retroactive tasks.
ALTER TABLE fleet_requests ADD COLUMN IF NOT EXISTS report_owner_id uuid REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE fleet_trip_reports ADD COLUMN IF NOT EXISTS reporting_task_id uuid UNIQUE REFERENCES tasks(id) ON DELETE RESTRICT;
ALTER TABLE fleet_trip_reports ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}';
ALTER TABLE fleet_trip_reports ALTER COLUMN task_id DROP NOT NULL;
ALTER TABLE fleet_trip_reports DROP CONSTRAINT IF EXISTS fleet_trip_reports_task_id_fkey;
ALTER TABLE fleet_trip_reports ADD CONSTRAINT fleet_trip_reports_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS fleet_report_task_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  report_id uuid NOT NULL REFERENCES fleet_trip_reports(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_report_task_links_report_task_unique UNIQUE(report_id, task_id)
);
ALTER TABLE fleet_report_task_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS fleet_report_task_links_task_idx ON fleet_report_task_links(task_id);
