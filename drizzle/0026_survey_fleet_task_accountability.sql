ALTER TABLE issues ADD COLUMN IF NOT EXISTS task_id uuid UNIQUE REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE fleet_requests ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES tasks(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS fleet_trip_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  request_id uuid NOT NULL UNIQUE REFERENCES fleet_requests(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES profiles(id),
  due_at timestamptz NOT NULL,
  submitted_at timestamptz,
  summary text,
  attachment_urls text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
