CREATE TYPE "public"."roster_hub_property_kind" AS ENUM ('hub', 'spoke');
CREATE TYPE "public"."roster_labor_tier" AS ENUM ('fixed', 'variable');
CREATE TYPE "public"."roster_residency_type" AS ENUM ('resident', 'commuter');
CREATE TYPE "public"."roster_policy_status" AS ENUM ('draft', 'awaiting_hr_approval', 'approved', 'active', 'retired');
CREATE TYPE "public"."roster_input_source" AS ENUM ('manual', 'csv', 'opera', 'mihcm');
CREATE TYPE "public"."roster_cycle_status" AS ENUM ('draft', 'submitted', 'published', 'superseded');
CREATE TYPE "public"."roster_child_status" AS ENUM ('draft', 'submitted');
CREATE TYPE "public"."roster_violation_severity" AS ENUM ('hard', 'soft');
CREATE TYPE "public"."roster_violation_resolution" AS ENUM ('open', 'overridden', 'resolved_by_edit');
CREATE TYPE "public"."roster_assignment_source" AS ENUM ('generated', 'manual');
CREATE TYPE "public"."roster_rest_category" AS ENUM ('none', 'full', 'half');

CREATE TABLE "roster_hubs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "code" varchar(50) NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "roster_hubs_org_code_unique" UNIQUE("org_id", "code")
);

CREATE TABLE "roster_hub_properties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hub_id" uuid NOT NULL REFERENCES "roster_hubs"("id") ON DELETE CASCADE,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "kind" "roster_hub_property_kind" NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "roster_hub_properties_property_unique" UNIQUE("property_id"),
  CONSTRAINT "roster_hub_properties_hub_property_unique" UNIQUE("hub_id", "property_id")
);
CREATE INDEX "roster_hub_properties_hub_active_idx" ON "roster_hub_properties" ("hub_id", "is_active");

CREATE TABLE "roster_departments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "code" varchar(50) NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "roster_departments_org_code_unique" UNIQUE("org_id", "code")
);

CREATE TABLE "roster_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "department_id" uuid NOT NULL REFERENCES "roster_departments"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "code" varchar(80) NOT NULL,
  "labor_tier" "roster_labor_tier" NOT NULL,
  "same_hub_relief_eligible" boolean DEFAULT false NOT NULL,
  "is_area_manager" boolean DEFAULT false NOT NULL,
  "is_property_manager" boolean DEFAULT false NOT NULL,
  "is_minimum_floor_role" boolean DEFAULT false NOT NULL,
  "minimum_floor" integer DEFAULT 0 NOT NULL CHECK ("minimum_floor" >= 0),
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "roster_roles_org_code_unique" UNIQUE("org_id", "code")
);

CREATE TABLE "roster_employees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "employee_number" varchar(80) NOT NULL,
  "full_name" text NOT NULL,
  "role_id" uuid NOT NULL REFERENCES "roster_roles"("id") ON DELETE RESTRICT,
  "base_property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE RESTRICT,
  "profile_id" uuid UNIQUE REFERENCES "profiles"("id") ON DELETE SET NULL,
  "residency_type" "roster_residency_type" NOT NULL,
  "home_distance_km" numeric(7,2) DEFAULT 0 NOT NULL CHECK ("home_distance_km" >= 0),
  "employment_start_date" date NOT NULL,
  "employment_end_date" date,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_demo" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "roster_employees_org_number_unique" UNIQUE("org_id", "employee_number"),
  CONSTRAINT "roster_employees_employment_dates_check" CHECK ("employment_end_date" IS NULL OR "employment_end_date" >= "employment_start_date")
);
CREATE INDEX "roster_employees_org_property_active_idx" ON "roster_employees" ("org_id", "base_property_id", "is_active");

CREATE TABLE "roster_employee_skills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL REFERENCES "roster_employees"("id") ON DELETE CASCADE,
  "role_id" uuid NOT NULL REFERENCES "roster_roles"("id") ON DELETE RESTRICT,
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "roster_employee_skills_employee_role_unique" UNIQUE("employee_id", "role_id")
);

CREATE TABLE "roster_property_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "property_id" uuid NOT NULL UNIQUE REFERENCES "properties"("id") ON DELETE CASCADE,
  "bar_close_time" time NOT NULL,
  "transport_cutoff" time NOT NULL,
  "multi_zone_separation" boolean DEFAULT false NOT NULL,
  "safari_focus" boolean DEFAULT false NOT NULL,
  "outsourced_security" boolean DEFAULT false NOT NULL,
  "time_zone" varchar(64) DEFAULT 'Asia/Colombo' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE "roster_cadre_requirements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "role_id" uuid NOT NULL REFERENCES "roster_roles"("id") ON DELETE CASCADE,
  "required_daily_active" integer NOT NULL CHECK ("required_daily_active" >= 0),
  "relief_multiplier" numeric(5,2) DEFAULT 1.50 NOT NULL CHECK ("relief_multiplier" > 0),
  "effective_from" date NOT NULL,
  "effective_to" date,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "roster_cadre_property_role_from_unique" UNIQUE("property_id", "role_id", "effective_from"),
  CONSTRAINT "roster_cadre_dates_check" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from")
);
CREATE INDEX "roster_cadre_property_role_dates_idx" ON "roster_cadre_requirements" ("property_id", "role_id", "effective_from", "effective_to");

CREATE TABLE "roster_staffing_bands" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "role_id" uuid NOT NULL REFERENCES "roster_roles"("id") ON DELETE CASCADE,
  "occupancy_min" numeric(5,2) NOT NULL CHECK ("occupancy_min" >= 0 AND "occupancy_min" <= 100),
  "occupancy_max" numeric(5,2) NOT NULL CHECK ("occupancy_max" >= 0 AND "occupancy_max" <= 100),
  "required_active" integer NOT NULL CHECK ("required_active" >= 0),
  "effective_from" date NOT NULL,
  "effective_to" date,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "roster_bands_property_role_range_from_unique" UNIQUE("property_id", "role_id", "occupancy_min", "occupancy_max", "effective_from"),
  CONSTRAINT "roster_bands_range_check" CHECK ("occupancy_max" >= "occupancy_min"),
  CONSTRAINT "roster_bands_dates_check" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from")
);
CREATE INDEX "roster_bands_property_role_dates_idx" ON "roster_staffing_bands" ("property_id", "role_id", "effective_from", "effective_to");

CREATE TABLE "roster_policy_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "version" integer NOT NULL CHECK ("version" > 0),
  "status" "roster_policy_status" DEFAULT 'draft' NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "approved_by_name" text,
  "approved_at" timestamptz,
  "evidence_reference" text,
  "created_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "activated_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "activated_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "roster_policy_versions_org_name_version_unique" UNIQUE("org_id", "name", "version"),
  CONSTRAINT "roster_policy_versions_dates_check" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from")
);

CREATE TABLE "roster_policy_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "policy_version_id" uuid NOT NULL REFERENCES "roster_policy_versions"("id") ON DELETE CASCADE,
  "rule_code" varchar(100) NOT NULL,
  "calculation_type" varchar(80) NOT NULL,
  "severity" "roster_violation_severity" NOT NULL,
  "max_working_minutes_per_day" integer,
  "max_working_minutes_per_week" integer,
  "work_week_starts_on" integer CHECK ("work_week_starts_on" BETWEEN 0 AND 6),
  "monthly_workday_target" integer,
  "full_rest_days_per_week" integer,
  "half_rest_days_per_week" integer,
  "break_threshold_minutes" integer,
  "break_minutes" integer,
  "minimum_split_gap_minutes" integer,
  "maximum_spreadover_minutes" integer,
  "commuter_straight_shift_required" boolean,
  "enforce_transport_cutoff" boolean,
  "travel_distance_threshold_km" numeric(7,2),
  "resident_target_percent" numeric(5,2),
  "commuter_target_percent" numeric(5,2),
  "area_manager_spoke_days" integer,
  "area_manager_overlap_days" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "roster_policy_rules_version_code_unique" UNIQUE("policy_version_id", "rule_code")
);

CREATE TABLE "roster_shift_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "policy_version_id" uuid NOT NULL REFERENCES "roster_policy_versions"("id") ON DELETE CASCADE,
  "role_id" uuid NOT NULL REFERENCES "roster_roles"("id") ON DELETE CASCADE,
  "code" varchar(100) NOT NULL,
  "label" text NOT NULL,
  "applicability_code" varchar(100) NOT NULL,
  "duty_code" varchar(20) DEFAULT 'W' NOT NULL,
  "scheduled_minutes" integer NOT NULL,
  "break_minutes" integer NOT NULL,
  "working_minutes" integer NOT NULL,
  "is_published" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "roster_shift_templates_policy_role_code_unique" UNIQUE("policy_version_id", "role_id", "code")
);

CREATE TABLE "roster_shift_template_segments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shift_template_id" uuid NOT NULL REFERENCES "roster_shift_templates"("id") ON DELETE CASCADE,
  "sort_order" integer NOT NULL,
  "start_time" time NOT NULL,
  "end_time" time NOT NULL,
  "ends_next_day" boolean DEFAULT false NOT NULL,
  CONSTRAINT "roster_shift_segments_template_order_unique" UNIQUE("shift_template_id", "sort_order")
);

CREATE TABLE "roster_import_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "import_type" varchar(50) NOT NULL,
  "source_file_name" text NOT NULL,
  "file_checksum" varchar(128) NOT NULL,
  "status" varchar(30) DEFAULT 'preview' NOT NULL,
  "total_count" integer DEFAULT 0 NOT NULL,
  "add_count" integer DEFAULT 0 NOT NULL,
  "update_count" integer DEFAULT 0 NOT NULL,
  "unchanged_count" integer DEFAULT 0 NOT NULL,
  "error_count" integer DEFAULT 0 NOT NULL,
  "preview_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "committed_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "committed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "roster_import_batches_org_created_idx" ON "roster_import_batches" ("org_id", "created_at");

CREATE TABLE "roster_forecasts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "forecast_date" date NOT NULL,
  "occupancy_percent" numeric(5,2) NOT NULL CHECK ("occupancy_percent" BETWEEN 0 AND 100),
  "arrivals_count" integer DEFAULT 0 NOT NULL,
  "departures_count" integer DEFAULT 0 NOT NULL,
  "source" "roster_input_source" NOT NULL,
  "import_batch_id" uuid REFERENCES "roster_import_batches"("id") ON DELETE SET NULL,
  "updated_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "roster_forecasts_property_date_unique" UNIQUE("property_id", "forecast_date")
);
CREATE INDEX "roster_forecasts_property_date_idx" ON "roster_forecasts" ("property_id", "forecast_date");

CREATE TABLE "roster_unavailability" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL REFERENCES "roster_employees"("id") ON DELETE CASCADE,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "type" varchar(50) NOT NULL,
  "source" "roster_input_source" NOT NULL,
  "external_reference" text,
  "operational_note" text,
  "import_batch_id" uuid REFERENCES "roster_import_batches"("id") ON DELETE SET NULL,
  "created_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "roster_unavailability_dates_check" CHECK ("end_date" >= "start_date")
);
CREATE INDEX "roster_unavailability_employee_dates_idx" ON "roster_unavailability" ("employee_id", "start_date", "end_date");

CREATE TABLE "roster_boundary_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL REFERENCES "roster_employees"("id") ON DELETE CASCADE,
  "assignment_date" date NOT NULL,
  "working_minutes" integer DEFAULT 0 NOT NULL,
  "rest_category" "roster_rest_category" DEFAULT 'none' NOT NULL,
  "source" "roster_input_source" NOT NULL,
  "recorded_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "import_batch_id" uuid REFERENCES "roster_import_batches"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "roster_boundary_employee_date_unique" UNIQUE("employee_id", "assignment_date")
);

CREATE TABLE "roster_cycles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "hub_id" uuid NOT NULL REFERENCES "roster_hubs"("id") ON DELETE RESTRICT,
  "month" date NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "status" "roster_cycle_status" DEFAULT 'draft' NOT NULL,
  "policy_version_id" uuid NOT NULL REFERENCES "roster_policy_versions"("id") ON DELETE RESTRICT,
  "version" integer DEFAULT 1 NOT NULL,
  "created_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "submitted_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "submitted_at" timestamptz,
  "published_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "published_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "roster_cycles_hub_month_revision_unique" UNIQUE("hub_id", "month", "revision")
);
CREATE INDEX "roster_cycles_hub_month_revision_idx" ON "roster_cycles" ("hub_id", "month", "revision");

CREATE TABLE "rosters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cycle_id" uuid NOT NULL REFERENCES "roster_cycles"("id") ON DELETE CASCADE,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE RESTRICT,
  "status" "roster_child_status" DEFAULT 'draft' NOT NULL,
  "submitted_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "submitted_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "rosters_cycle_property_unique" UNIQUE("cycle_id", "property_id")
);

CREATE TABLE "roster_input_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cycle_id" uuid NOT NULL UNIQUE REFERENCES "roster_cycles"("id") ON DELETE CASCADE,
  "checksum" varchar(128) NOT NULL,
  "normalized_input" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE "roster_participants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cycle_id" uuid NOT NULL REFERENCES "roster_cycles"("id") ON DELETE CASCADE,
  "employee_id" uuid REFERENCES "roster_employees"("id") ON DELETE SET NULL,
  "employee_number" varchar(80) NOT NULL,
  "full_name" text NOT NULL,
  "base_property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE RESTRICT,
  "primary_role_id" uuid NOT NULL REFERENCES "roster_roles"("id") ON DELETE RESTRICT,
  "role_code" varchar(80) NOT NULL,
  "department_code" varchar(80) NOT NULL,
  "labor_tier" "roster_labor_tier" NOT NULL,
  "residency_type" "roster_residency_type" NOT NULL,
  "skill_codes" varchar(80)[] DEFAULT '{}'::varchar[] NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "roster_participants_cycle_employee_number_unique" UNIQUE("cycle_id", "employee_number")
);

CREATE TABLE "roster_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cycle_id" uuid NOT NULL REFERENCES "roster_cycles"("id") ON DELETE CASCADE,
  "participant_id" uuid NOT NULL REFERENCES "roster_participants"("id") ON DELETE CASCADE,
  "assignment_date" date NOT NULL,
  "duty_code" varchar(20) NOT NULL,
  "duty_property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE RESTRICT,
  "role_id" uuid NOT NULL REFERENCES "roster_roles"("id") ON DELETE RESTRICT,
  "shift_template_id" uuid REFERENCES "roster_shift_templates"("id") ON DELETE SET NULL,
  "scheduled_minutes" integer DEFAULT 0 NOT NULL,
  "break_minutes" integer DEFAULT 0 NOT NULL,
  "working_minutes" integer DEFAULT 0 NOT NULL,
  "source" "roster_assignment_source" DEFAULT 'generated' NOT NULL,
  "explanation" text NOT NULL,
  "reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "roster_assignments_cycle_participant_date_unique" UNIQUE("cycle_id", "participant_id", "assignment_date")
);
CREATE INDEX "roster_assignments_cycle_date_property_idx" ON "roster_assignments" ("cycle_id", "assignment_date", "duty_property_id");

CREATE TABLE "roster_assignment_segments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "assignment_id" uuid NOT NULL REFERENCES "roster_assignments"("id") ON DELETE CASCADE,
  "sort_order" integer NOT NULL,
  "start_time" time NOT NULL,
  "end_time" time NOT NULL,
  "ends_next_day" boolean DEFAULT false NOT NULL,
  CONSTRAINT "roster_assignment_segments_assignment_order_unique" UNIQUE("assignment_id", "sort_order")
);

CREATE TABLE "roster_violations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cycle_id" uuid NOT NULL REFERENCES "roster_cycles"("id") ON DELETE CASCADE,
  "rule_code" varchar(100) NOT NULL,
  "severity" "roster_violation_severity" NOT NULL,
  "resolution" "roster_violation_resolution" DEFAULT 'open' NOT NULL,
  "message" text NOT NULL,
  "participant_id" uuid REFERENCES "roster_participants"("id") ON DELETE CASCADE,
  "property_id" uuid REFERENCES "properties"("id") ON DELETE RESTRICT,
  "violation_date" date,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "override_reason" text,
  "resolved_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "resolved_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "roster_violations_cycle_severity_resolution_idx" ON "roster_violations" ("cycle_id", "severity", "resolution");

CREATE TABLE "roster_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cycle_id" uuid NOT NULL REFERENCES "roster_cycles"("id") ON DELETE CASCADE,
  "actor_id" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "cycle_version" integer NOT NULL,
  "event_type" varchar(80) NOT NULL,
  "context" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX "roster_events_cycle_created_idx" ON "roster_events" ("cycle_id", "created_at");
