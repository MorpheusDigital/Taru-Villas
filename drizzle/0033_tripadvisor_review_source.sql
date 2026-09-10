-- Existing Google rows remain unchanged; both public review providers use the same tables.
ALTER TABLE ota_review_sources DROP CONSTRAINT IF EXISTS ota_review_sources_source_check;
ALTER TABLE ota_review_sources ADD CONSTRAINT ota_review_sources_source_check
  CHECK (source IN ('google', 'tripadvisor'));
