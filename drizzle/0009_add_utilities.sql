-- Utility Type Enum
CREATE TYPE IF NOT EXISTS "public"."utility_type" AS ENUM('water', 'electricity');
--> statement-breakpoint

-- Utility Rate Tiers
CREATE TABLE IF NOT EXISTS "utility_rate_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"utility_type" "utility_type" NOT NULL,
	"tier_number" integer NOT NULL,
	"min_units" numeric(10, 2) NOT NULL,
	"max_units" numeric(10, 2),
	"rate_per_unit" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "utility_rate_tiers_property_type_tier_unique" UNIQUE("property_id","utility_type","tier_number")
);
--> statement-breakpoint

-- Utility Meter Readings
CREATE TABLE IF NOT EXISTS "utility_meter_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"utility_type" "utility_type" NOT NULL,
	"reading_date" date NOT NULL,
	"reading_value" numeric(12, 2) NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "utility_meter_readings_property_type_date_unique" UNIQUE("property_id","utility_type","reading_date")
);
--> statement-breakpoint

-- Foreign keys
ALTER TABLE "utility_rate_tiers" ADD CONSTRAINT "utility_rate_tiers_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "utility_meter_readings" ADD CONSTRAINT "utility_meter_readings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "utility_meter_readings" ADD CONSTRAINT "utility_meter_readings_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
