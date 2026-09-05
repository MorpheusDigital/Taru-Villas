-- Additive migration; existing vehicles retain unknown metadata and no manager.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS administration_manager_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS renewal_lead_days integer NOT NULL DEFAULT 30 CHECK (renewal_lead_days BETWEEN 0 AND 365);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS compliance jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS vehicle_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  kind varchar(32) NOT NULL CHECK (kind IN ('revenueLicence', 'insurance', 'emission')),
  expiry_date date NOT NULL,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_renewals_cycle_unique UNIQUE(vehicle_id, kind, expiry_date)
);
CREATE INDEX IF NOT EXISTS vehicle_renewals_org_idx ON vehicle_renewals(org_id);
CREATE INDEX IF NOT EXISTS vehicle_renewals_task_idx ON vehicle_renewals(task_id);
ALTER TABLE vehicle_renewals ENABLE ROW LEVEL SECURITY;
