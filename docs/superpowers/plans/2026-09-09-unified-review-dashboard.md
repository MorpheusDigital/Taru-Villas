# Unified Review Dashboard Implementation Plan

> **For agentic workers:** Execute bounded independent review analysis batches alongside inline dashboard implementation; verify each artifact before integration.

**Goal:** Deliver the approved unified dashboard and synthesize the current review snapshot.
**Architecture:** Server queries load authorized survey and Google evidence; a pure aggregation module computes equal-source scores, category summaries, and monthly history. A server dashboard renders filters/feed with a small client chart. Validated offline analysis is stored in a dedicated table.
**Tech Stack:** Existing Next.js, Drizzle, PostgreSQL, React, Recharts, Vitest.
**Spec:** ../specs/2026-09-09-unified-review-dashboard.md

## Global constraints
- Equal weight per available source; scale-bound normalization to 0–10.
- Preserve source ratings and raw reviews; no synthetic overall ratings or invented dates.
- Inferred categories need exact evidence and provenance; unsupported categories absent.
- Org/property access required. No new runtime dependencies or external AI calls.

## Execution
- [x] Analyze all imported texts using hospitality-v1 rubric in independent property batches; validate complete ids and exact excerpts.
- [x] Test and implement pure consolidation in src/lib/reviews/consolidated.ts (source balancing, date eligibility, category mapping, missing values, period filters, no double counting).
- [x] Add ota_review_analyses schema/migration and idempotent validated backfill script; retain all original reviews.
- [x] Implement authorized evidence query in src/lib/db/queries/consolidated-reviews.ts. Fetch one survey item per submission with weighted response score and mapped categories. Fetch valid Google reviews with analysis metadata.
- [x] Build unified dashboard and chart using existing components; replace both dashboard page renderers while keeping permissions and utility rollup. Old surveyType URLs render consolidated view.
- [x] Validate import dry run, apply analysis, verify source totals and query isolation. Run tests, tsc, lint changed files, production build and localhost browser checks.
- [ ] Review code, commit on codex/taru-release and deploy; verify Vercel ready and production alias.
