-- One-time evidence-backed synthesis of existing reviews. No raw reviews change.
CREATE TABLE IF NOT EXISTS ota_review_analyses (
  review_id uuid PRIMARY KEY REFERENCES ota_reviews(id) ON DELETE CASCADE,
  rubric_version text NOT NULL,
  model text NOT NULL,
  input_hash text NOT NULL,
  aspects jsonb NOT NULL CHECK (jsonb_typeof(aspects) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Access is through organization-scoped server queries, never the public client.
ALTER TABLE ota_review_analyses ENABLE ROW LEVEL SECURITY;
