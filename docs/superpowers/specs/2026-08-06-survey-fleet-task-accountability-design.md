# Survey & Fleet Task Accountability

**Date:** 2026-08-06
**Status:** Approved, implementation requested

## Goal

Make Task Manager the accountable work record for both survey findings and fleet visits, while
retaining the survey Issue as its own quality-audit record.

Two flows are introduced together:

1. A low-score internal-survey response creates its normal Issue and a linked Task assigned to the
   property's primary manager.
2. A fleet request must link to an existing property-linked open Task or create a new
   property-linked Task. Once the request's dispatch is completed, its requester must submit one
   report within 72 hours, attached to that Task.

## Decisions

### Survey Issues

- Existing Issue creation remains unchanged: internal responses scoring `<= 6` with an
  `issueDescription` create one Issue.
- Each newly created Issue also receives exactly one linked Task in a per-organization project named
  **Survey Issues**. The project is created automatically on first use, with the existing unique
  `(orgId, name)` constraint ensuring one project per organization.
- The Task inherits the Issue title, description, property, and the issue's assigned primary
  property manager. Its status starts as `todo`, priority as `medium`, and creator is the survey
  submitter.
- Issue and Task status remain independent. Completing the Task never closes the Issue; survey
  closure notes remain an explicit quality-management action.

### Fleet request task reason

- Creating a fleet request requires exactly one Task reason. The form presents two mutually
  exclusive paths: **Link existing Task** or **Create new Task**.
- Existing choices are limited to active-project Tasks in the requester's organization that are not
  `done` and already have a property. The selected Task is stored on the fleet request.
- Creating a Task inline requires an active project and property. For a Property Visit, the property
  is the visit destination and is locked to it. For an Other trip, the requester selects the
  responsible property. The title is prefilled from the trip purpose, the requester becomes the
  creator and an assignee, and the task begins as `todo` with `medium` priority.
- A Task may support more than one fleet request. Every fleet request carries its own Task foreign
  key so repeated visits remain individually traceable.

### Trip reports

- Completing a dispatch creates one pending report obligation for every live fleet request in its
  stops. Pooled journeys therefore create one report per requester/request, not a shared vehicle
  report.
- The deadline is the dispatch's actual `completedAt` plus 72 hours. A report is `pending`,
  `submitted`, or dynamically **overdue** once the deadline passes without submission.
- Only the request owner may submit their report; fleet administrators can view all report state.
- Submission requires a written outcome/follow-up summary. It may include zero or more external
  file URLs. The platform does not add a file-upload or Storage feature in this scope.
- The report stores the request, Task, organization, requester, due time, submission time, summary,
  and URL list. Its direct Task foreign key makes the report an attached, durable Task record.
- Dispatch completion continues to notify requesters. The notification directs them to Fleet and
  states that their report is due within 72 hours. No scheduled reminder or new-booking block is
  added in this release; overdue status is visible in Fleet and Task Manager.

## Data model

Migration `drizzle/0026_survey_fleet_task_accountability.sql` adds:

| Table / field | Purpose |
|---|---|
| `issues.task_id` | Nullable, unique FK to `tasks`; binds one survey Issue to its generated Task. |
| `fleet_requests.task_id` | Nullable FK to `tasks` for historic-request compatibility; mandatory for all new requests in the API. |
| `fleet_trip_reports` | One row per request (`UNIQUE(request_id)`), directly linked to its Task. |

`fleet_trip_reports` columns: `id`, `org_id`, `request_id`, `task_id`, `submitted_by`, `due_at`,
`submitted_at`, `summary`, `attachment_urls text[] NOT NULL DEFAULT '{}'`, `created_at`, and
`updated_at`. Requests, tasks, and profiles retain their report history through foreign keys; report
rows cascade when their request or task is deleted.

Historic Issues and fleet requests remain valid without a backfill. The new write paths make both
links mandatory whenever they create fresh records.

## Backend flow

### Survey submission

Both submitted-survey paths (`POST /api/surveys` with submitted status and
`POST /api/surveys/[id]?action=submit`) call one transaction-aware service. For each qualifying
response it inserts an Issue, resolves/creates Survey Issues, inserts and assigns the Task, then
stores the Issue-to-Task link. A failure rolls back the matching Issue/Task pair rather than leaving
a half-linked result.

### Fleet request creation

`POST /api/fleet/requests` validates the task choice before applying fleet capacity constraints:

- Linked task: validate task organization, active project, non-`done` status, and non-null property.
- New task: validate project organization and active status; require its property; assign the
  requester.
- Property Visits require the task property to match `targetPropertyId`.

The route creates the inline Task when needed and the fleet request with `taskId` in one database
transaction. A failed request cannot leave a standalone generated Task.

### Dispatch completion and reporting

Driver completion moves the dispatch to completed and creates missing report obligations for its
non-cancelled request stops. The write is idempotent through the report's unique request key.

The authenticated report endpoint verifies that the caller owns the request, that its dispatch has
completed, and that no report was submitted already. It validates the required summary and normalizes
missing attachment URLs to `[]` before inserting the report.

## UI and visibility

### Fleet

- Request form: required Task Reason section with the two approved paths. Editing a pending request
  preserves its existing linked Task; it cannot silently change or remove the link.
- Requests table: show linked Task title and report status. Completed requests belonging to the
  requester offer **Submit trip report** until submitted; overdue is visually distinct.
- Report dialog: required summary textarea plus repeatable optional file-URL inputs.

### Task Manager

- Survey-generated Tasks display a survey-Issue source indicator.
- Task detail/dialog shows linked fleet requests and their report state, report summary, submission
  time, due time, and attachment URLs when present.
- Existing Task Manager behavior, projects, boards, lists, assignees, and deletion permissions stay
  unchanged outside the new traceability information.

## Authorization

| Action | Authorized users |
|---|---|
| Create survey-linked task | System, using the survey submitter and property's primary manager |
| Link/create task during fleet request | Fleet-booking user, subject to existing fleet access |
| Read own report obligation | Fleet request owner |
| Submit report | Fleet request owner only |
| View all fleet-report state | Fleet admin |
| View report from linked Task | Existing Task Manager audience |

## Out of scope

- Automatic synchronization of Issue and Task status.
- File uploads, Supabase Storage configuration, or attachment scanning; report attachments are URLs.
- Scheduled report reminders, e-mail, and blocking future fleet requests for overdue reports.
- Converting Issues into Tasks or deleting the Issues area.

## Acceptance criteria

1. Every qualifying internal-survey response creates one Issue and one linked Survey Issues Task.
2. The Survey Issues project is created once per organization and reused.
3. The generated survey Task is property-linked and assigned to the property's primary manager when
   one exists.
4. New fleet requests cannot be created without linking an eligible Task or creating a new
   property-linked Task in an active project.
5. An inline fleet Task and its fleet request are created atomically.
6. A completed pooled dispatch creates a separate 72-hour report obligation for each live request.
7. Only each request owner can submit their required summary and optional file URLs.
8. Fleet shows pending, submitted, and overdue report state; Task Manager exposes the same linked
   history.
9. Issue completion and generated Task completion remain independent.
