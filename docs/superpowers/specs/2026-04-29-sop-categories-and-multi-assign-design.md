# SOP Categories + Multi-Assign — Design

**Date:** 2026-04-29
**Status:** Draft for review
**Scope:** Two related features shipping together — categorize SOP templates and batch-create SOP assignments across multiple users × properties in one dialog.

---

## Background

Today, an admin creating SOP assignments must repeat a single-row form once per `(template, property, user)` combination. For a daily morning checklist that should go to all 8 PMs across 3 properties, that's 24 submits. There is also no way to organize templates — `My Checklists` on `/sops` renders a flat list, which becomes hard to scan as the template count grows.

This design adds:
1. **Categories** — an org-level grouping for SOP templates, surfaced as section headers on `My Checklists` and managed via a dedicated admin tab.
2. **Multi-assign matrix dialog** — a single dialog where the admin picks N users × M properties, sees a generated row per combination with per-row schedule controls, and submits to create all rows in one batch.

Both features touch the same files (template form, sidebar tabs, `/sops` rendering, API surface) so they ship as one spec.

---

## Goals

- An admin can assign one template to many `(user, property)` combinations from a single dialog.
- Each combination can have its own frequency + deadline; a default at the top pre-fills new rows to keep the common case fast.
- The dialog visibly accounts for combinations that already exist (no silent skipping, no accidental edits).
- `My Checklists` on `/sops` is grouped by category, ordered by an admin-controlled sort order.
- Admins manage the category list (rename, reorder, delete) without touching individual templates.
- Existing SOP templates without a category continue to work and render under "Uncategorized".

## Non-goals

- Per-property categories (categories are org-level).
- Color or icon per category.
- Bulk re-categorize templates from the management page (admin uses the template list with a category filter for that — handled separately if needed).
- Editing existing assignments through the multi-assign matrix; the per-row edit flow stays as is.
- Migration script that backfills `category_id` for existing rows; admin assigns categories through the new UI as a one-time cleanup.

---

## Schema changes

### New table: `sop_categories`

```ts
export const sopCategories = pgTable(
  'sop_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('sop_categories_org_name_unique').on(table.orgId, table.name),
  ]
)
```

### Modified table: `sop_templates`

Add one column:

```ts
categoryId: uuid('category_id').references(() => sopCategories.id, {
  onDelete: 'restrict',
}),
```

- Nullable in DB to keep existing rows valid without a backfill.
- `onDelete: 'restrict'` so the DB rejects deletion of a category that's still referenced; the API surfaces this as a 409 with a template count (see API table). This keeps DB-level and app-level behavior aligned.
- Application-level Zod validator on the create/edit template endpoint requires `categoryId` for **new** templates. Existing templates can still be saved with `categoryId: null` so admins aren't forced to pick a category before they're ready.

### `sop_assignments` — no schema change

The unique constraint `sop_assignments_template_property_user_unique` on `(templateId, propertyId, userId)` already exists. Multi-assign is a UI/API batch layer over this constraint.

---

## Categories — admin surfaces

### Inline picker in the template form

`src/components/admin/sop-builder.tsx` — add a category combobox above the existing name/description fields.

- Combobox shows existing categories (ordered by `sortOrder`, then `name`). Built on the existing `Popover` + `Command` (cmdk) primitives in `src/components/ui/`.
- Footer item `+ Create new category…` opens a small inline input → POSTs to the categories API → injects the new category into the dropdown selected.
- Required for **new** templates (Zod refinement on submit).
- Existing templates without a category render with `(no category)` placeholder; admin can save without picking, but if they pick one it persists.

### Management tab at `/sops/categories`

New admin-only tab in `SopsAreaTabs` (`src/components/sops/sops-area-tabs.tsx`).

- New page: `src/app/(portal)/sops/categories/page.tsx` (server component, calls a query for `categories with template counts`).
- New client component: `src/components/sops/sop-categories-management.tsx`.
- Layout:
  - Vertical list, drag handle on the left, name (inline-editable on click), template count badge, delete button on the right.
  - Drag-to-reorder updates `sortOrder` via `PATCH /api/sops/categories/reorder` (single batch call with the new order array).
  - Inline rename uses `PATCH /api/sops/categories/:id`.
  - Delete via `DELETE /api/sops/categories/:id`. Server returns 409 if any template still references the category. Client shows the count from the response and a link to the templates list pre-filtered by that category for reassignment.
  - "Add category" button at the top of the list opens an inline row.

---

## Categories — `/sops` My Checklists

`src/components/sops/my-sops-client.tsx` (270 lines today, flat-list rendering).

- Group items by `category_id` (resolved to category name) before rendering.
- Order groups by category `sortOrder`, then `name`.
- "Uncategorized" group renders **last** for items where the underlying template has `categoryId IS NULL`.
- Section header: category name + count badge of items in that group.
- Within a group, the existing sort (deadline, then template name) is preserved.
- Empty groups are not rendered.

The `/api/sops/my` query joins `sop_templates → sop_categories` and returns the category name + sort order alongside each item; client-side groups them.

---

## Multi-assign dialog

Replaces the current single-row "Add Assignment" form in `src/components/admin/sop-assignments.tsx`. The list-and-edit-existing surface in that file stays as is — only the "Add" entry point opens the new dialog.

### Layout

```
┌─ Add Assignments ────────────────────────────────────────┐
│ Users:       [chip][chip][chip][+ Add user ▾]            │
│ Properties:  [chip][chip][+ Add property ▾]              │
│                                                           │
│ Default schedule (applies to new rows below):            │
│   Frequency: [Daily ▾]   Deadline: [09:00]               │
│   (when frequency is Weekly: also a Day-of-week picker)  │
│                                                           │
│ ─────────────────────────────────────────────────────     │
│ User      Property   Frequency        Deadline    Status │
│ Alice     Sands      Daily            09:00       New    │
│ Alice     Six        Daily            09:00       New    │
│ Bob       Sands      —    —    —    —    —        Exists │ (greyed)
│ Bob       Six        Weekly Mon       14:00       New    │
│ Carol     Sands      Daily            09:00       New    │
│ Carol     Six        Daily            09:00       New    │
│ ─────────────────────────────────────────────────────     │
│ Will create 5. 1 already exists — will skip.             │
│                              [Cancel] [Create 5]         │
└──────────────────────────────────────────────────────────┘
```

### Behavior

- **Cross-product generation:** when both User and Property selections are non-empty, the matrix renders `users.length × properties.length` rows.
- **Existing rows:** server returns the list of `(propertyId, userId)` pairs already assigned for this template when the dialog opens; whenever the chip selection changes, the matched rows in the matrix render greyed-out with status "Exists — will skip" and disabled pickers. They are NOT included in the create payload.
- **Default schedule:**
  - Pre-fills new rows on first generation.
  - Changing the default after rows exist prompts: "Apply to all rows? Yes / No (default Yes)". On Yes, all New rows reset to the new default; per-row overrides are lost. On No, only newly added rows pick up the new default.
- **Per-row override:** each New row's frequency/deadline pickers are editable independently of the default.
- **Footer counts:** `Will create N. M already exist — will skip.` — live on every change.
- **Submit:** disabled when N (creatable rows) is 0. Posts to `POST /api/sops/assignments/batch`.

### Data shape submitted

```ts
{
  templateId: string,
  rows: Array<{
    userId: string,
    propertyId: string,
    frequency: 'daily' | 'weekly' | 'monthly',
    deadlineTime: string,    // 'HH:mm'
    deadlineDay: number | null, // 1–7 for weekly, 1–31 for monthly, null for daily
    notifyOnOverdue: boolean,   // defaults false; UI exposes a single checkbox at dialog level
  }>
}
```

### Server logic for batch create

`src/app/api/sops/assignments/batch/route.ts`:

1. Authn + admin role check.
2. Zod-validate payload.
3. For each row, attempt insert wrapped in a single transaction. The DB unique constraint is the source of truth for skipping — if insert fails on the unique violation, count it as `skipped`. Any other error rolls back the transaction.
4. Return `{ created: number, skipped: number }`.
5. Client toasts the result.

The UI dedup against existing rows is the primary defense (predictable preview + button label); the DB constraint catches a race where someone else added a row between the dialog opening and submit.

---

## API changes

| Method | Path | Behavior | Auth |
|--------|------|----------|------|
| `GET` | `/api/sops/categories` | List categories for org, ordered by `sortOrder, name`. Includes `templateCount` per category. | Admin |
| `POST` | `/api/sops/categories` | Create. Body: `{ name }`. Returns the new row. 409 on duplicate name. | Admin |
| `PATCH` | `/api/sops/categories/[id]` | Rename. Body: `{ name }`. | Admin |
| `DELETE` | `/api/sops/categories/[id]` | Delete. 409 with `{ templateCount }` if referenced. | Admin |
| `PATCH` | `/api/sops/categories/reorder` | Body: `{ order: string[] }` (array of category IDs in new order). Updates `sortOrder` for all in one transaction. | Admin |
| `POST` | `/api/sops/assignments/batch` | Batch create assignments. See data shape above. | Admin |
| `POST/PATCH` | `/api/sops/templates` (existing) | Accept new `categoryId` field (nullable). Server validates the category belongs to the same org. | Admin |
| `GET` | `/api/sops/my` (existing) | Response shape gains `categoryName` and `categorySortOrder` per item. | Authenticated |

`POST /api/sops/assignments` (single-row create) stays for now — the matrix supersedes it as the entry point but the endpoint remains in case anything calls it directly.

---

## Files touched

**Schema + migration**
- `src/lib/db/schema.ts` — add `sopCategories` table + relations, add `categoryId` to `sopTemplates`.
- `drizzle/<timestamp>_sop_categories.sql` — generated migration.

**Queries**
- `src/lib/db/queries/sops.ts` — add `listCategories`, `createCategory`, `updateCategory`, `deleteCategory`, `reorderCategories`, `batchCreateAssignments`. Update `getMyChecklists` (or whatever the function is named that backs `/api/sops/my`) to include category name + sort order.

**API routes (new)**
- `src/app/api/sops/categories/route.ts` (GET, POST)
- `src/app/api/sops/categories/[id]/route.ts` (PATCH, DELETE)
- `src/app/api/sops/categories/reorder/route.ts` (PATCH)
- `src/app/api/sops/assignments/batch/route.ts` (POST)

**API routes (modified)**
- `src/app/api/sops/templates/route.ts`, `src/app/api/sops/templates/[id]/route.ts` — accept `categoryId`, validate org-scoped FK.
- `src/app/api/sops/my/route.ts` — include category name + sort order in response.

**Pages (new)**
- `src/app/(portal)/sops/categories/page.tsx` — server component, admin-only (`requireRole(['admin'])`).

**Components (new)**
- `src/components/sops/sop-categories-management.tsx` — drag/reorder, inline rename, delete with conflict handling.
- `src/components/admin/sop-multi-assign-dialog.tsx` — the matrix dialog. Extracted as its own file rather than expanding `sop-assignments.tsx`, because the dialog is non-trivial (~250+ lines: chip pickers, matrix, default-schedule logic, conflict display).

**Components (modified)**
- `src/components/sops/sops-area-tabs.tsx` — add Categories tab (admin-only via existing role-gating pattern).
- `src/components/admin/sop-builder.tsx` — add category combobox with inline-create.
- `src/components/admin/sop-assignments.tsx` — replace the inline Add form with a button that opens `SopMultiAssignDialog`. List + edit-existing surface is unchanged.
- `src/components/sops/my-sops-client.tsx` — render grouped by category with section headers; "Uncategorized" group last.

---

## Migration steps

1. Drizzle migration creates `sop_categories` and adds `category_id` to `sop_templates` (nullable).
2. Deploy.
3. Admin opens `/sops/categories`, creates initial categories ("Morning", "Cleaning", "Maintenance", etc.).
4. Admin edits each existing template via the template form to assign a category. Uncategorized templates continue to work and render at the bottom of `/sops` until assigned.

No data migration script is run. The "Uncategorized" bucket is the migration safety net.

---

## Edge cases & error handling

- **Category referenced by templates on delete:** server returns 409 with `{ templateCount }`. UI shows "X templates use this category — reassign them first" with a link to the template list filtered by category.
- **Duplicate category name (same org):** server returns 409. UI shows inline error in the create/rename input.
- **Cross-org leak:** all category queries filter by the requesting user's `orgId`. The template form's category dropdown only fetches categories from the user's org. The template create endpoint validates that `categoryId` belongs to the same org before insert.
- **Multi-assign race condition:** if another admin creates an assignment for one of the matrix rows between the dialog opening and submit, the DB unique constraint rejects that row's insert; the transaction tolerates it and counts it as skipped.
- **Multi-assign with empty selection:** the matrix is empty; submit button is disabled.
- **Multi-assign with all rows already existing:** matrix shows all greyed-out rows; submit button is disabled with text "All combinations already exist".
- **Frequency-specific deadline fields:** the per-row pickers must show a day-of-week picker when frequency is `weekly` and a day-of-month picker when `monthly`. Default schedule fields show the same conditional behavior. Switching frequency clears the day field if it no longer applies.
- **Invalid Zod payload to batch endpoint:** server returns 400 with the field-level error array. Client toasts the first error message and leaves the dialog open so the admin can correct and resubmit. Highlighting the specific offending row is a stretch goal — at minimum the toast must be visible and the dialog must not close.

---

## Testing approach

Manual happy-path verification, since the existing project has no automated test suite:

1. **Categories CRUD** — create, rename, reorder (drag), delete-when-empty, delete-when-in-use (expect 409).
2. **Template form** — create new template (category required), edit existing template without category (allowed, can save), assign a category to an existing template, verify it surfaces under that group on `/sops`.
3. **`/sops` grouping** — items render under correct category headers, group order respects `sortOrder`, "Uncategorized" group appears last only when there are uncategorized items.
4. **Multi-assign matrix** — pick 2 users × 2 properties, verify 4 rows generated with default schedule. Override one row. Submit → verify 4 assignments created with correct schedules.
5. **Multi-assign with existing rows** — set up 1 existing assignment, open dialog with selections that include it, verify it shows as greyed "Exists — will skip", and only the 3 new rows are created.
6. **Default-change prompt** — generate rows, override one, change the default → expect "Apply to all? Yes/No" prompt; verify Yes resets all new rows, No only affects subsequently-added rows.
7. **Submit disabled** — empty selection, all-existing scenarios.
8. **Role gating** — non-admin attempts to access `/sops/categories` redirects per existing pattern; non-admin POST to category endpoints returns 403.

---

## Open questions

None at spec time. Minor copy decisions (exact wording of the "Apply to all rows?" prompt, toast strings) are deferred to the writing-plans pass.
