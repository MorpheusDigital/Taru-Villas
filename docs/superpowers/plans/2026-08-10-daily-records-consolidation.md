# Daily Records Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate Utilities and Daily Wastage into one Daily Records property workspace with Water, Electricity, and Daily Wastage tabs.

**Architecture:** Retain the existing utility and waste APIs, forms, summaries, permissions, and database tables. Add a shared Daily Records route and tab parser, reuse the existing data components inside the appropriate tab, and redirect legacy routes so bookmarks continue to reach the equivalent tab.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, lucide-react, shadcn Tabs.

## Global Constraints

- Do not alter utility or waste data models, API endpoints, or permissions.
- The Daily Records property page has exactly Water, Electricity, and Daily Wastage tabs.
- Existing `/utilities`, `/waste`, `/properties/[propertyId]/utilities`, and `/properties/[propertyId]/waste` routes redirect to the consolidated experience.
- Do not add packages or browser-test infrastructure.

---

### Task 1: Define safe Daily Records tab selection

**Files:**
- Create: `src/lib/daily-records/tabs.ts`
- Create: `src/lib/daily-records/tabs.test.ts`

**Interfaces:**
- Produces `DailyRecordTab = 'water' | 'electricity' | 'waste'`.
- Produces `getDailyRecordTab(tab: string | undefined): DailyRecordTab`.

- [x] **Step 1: Write the failing tests**

```ts
expect(getDailyRecordTab('waste')).toBe('waste')
expect(getDailyRecordTab(undefined)).toBe('water')
expect(getDailyRecordTab('invalid')).toBe('water')
```

- [x] **Step 2: Run the focused test and verify it fails because the module does not exist**

Run: `npm test -- src/lib/daily-records/tabs.test.ts`

- [x] **Step 3: Add the narrow tab parser**

```ts
export type DailyRecordTab = 'water' | 'electricity' | 'waste'

export function getDailyRecordTab(tab: string | undefined): DailyRecordTab {
  if (tab === 'electricity' || tab === 'waste') return tab
  return 'water'
}
```

- [x] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- src/lib/daily-records/tabs.test.ts`

### Task 2: Create the consolidated workspace and route compatibility

**Files:**
- Create: `src/app/(portal)/daily-records/page.tsx`
- Create: `src/app/(portal)/properties/[propertyId]/daily-records/page.tsx`
- Create: `src/components/daily-records/daily-records-page-client.tsx`
- Modify: `src/components/admin/utilities-page-client.tsx`
- Modify: `src/components/waste/waste-page-client.tsx`
- Modify: `src/app/(portal)/utilities/page.tsx`
- Modify: `src/app/(portal)/waste/page.tsx`
- Modify: `src/app/(portal)/properties/[propertyId]/utilities/page.tsx`
- Modify: `src/app/(portal)/properties/[propertyId]/waste/page.tsx`

- [x] **Step 1: Add the Daily Records property picker and property workspace**

The picker reuses the existing property card layout, with each card linking to `/properties/[propertyId]/daily-records`. The property page keeps the existing access check and renders a tabbed client workspace.

- [x] **Step 2: Render Water, Electricity, and Daily Wastage in one tab list**

Move the existing utility-only and waste-only page bodies behind reusable content components. The parent page owns the property header, Back action, and the three tabs; the current utility meter forms and waste log remain unchanged.

- [x] **Step 3: Redirect legacy URLs to their corresponding Daily Records location**

Redirect picker pages to `/daily-records`; utility property pages to `?tab=water`; waste property pages to `?tab=waste`.

- [x] **Step 4: Run focused and full unit tests**

Run: `npm test -- src/lib/daily-records/tabs.test.ts && npm test`

### Task 3: Consolidate navigation and page labels

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`
- Modify: `src/components/layout/header.tsx`
- Modify: `src/components/admin/utilities-page-client.tsx`
- Modify: `src/components/waste/waste-page-client.tsx`

- [x] **Step 1: Replace the two sidebar items with one Daily Records item**

Use `/daily-records` and a record-appropriate existing Lucide icon. Retain the sidebar's active-route behaviour for the new property route.

- [x] **Step 2: Direct every Back action to `/daily-records` and add the new breadcrumb label**

- [x] **Step 3: Verify the patch**

Run: `npm test && npm run lint -- src/components/layout/app-sidebar.tsx src/components/layout/header.tsx src/components/daily-records/daily-records-page-client.tsx src/components/admin/utilities-page-client.tsx src/components/waste/waste-page-client.tsx src/lib/daily-records/tabs.ts src/lib/daily-records/tabs.test.ts && git diff --check`
