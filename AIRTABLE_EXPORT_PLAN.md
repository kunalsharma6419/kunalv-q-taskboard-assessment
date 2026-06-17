# Airtable Export Implementation Plan

## Summary

Build a project-level export flow that pushes every task in a project into a real Airtable base using the official `airtable` npm package. The export starts from the project detail page, is authorized only for `admin` and `member` roles, retries transient Airtable failures, skips permanent failures without aborting the whole run, behaves idempotently when run more than once, and auto-creates missing Airtable columns when the token has schema write access.

## Product Behavior

- Add an `Export to Airtable` trigger on the project detail page.
- Show the trigger only for project users with role `admin` or `member`.
- Do not allow `viewer` users to trigger export from the UI.
- Enforce the same restriction again on the server.
- On success, return a per-run summary:
  - total tasks considered
  - created count
  - updated count
  - failed count
  - failed task details for partial failures
- Export is rerunnable without creating duplicate Airtable rows.
- A single bad Airtable record must not fail the entire export.
- Missing required Airtable columns should be created automatically before or during export, then the failed task should be retried.

## Backend Changes

### 1. Add a dedicated export endpoint

Create `POST /api/projects/:id/export-airtable`.

Behavior:
- authenticate via the existing bearer-token flow
- load the caller’s membership for the project
- reject non-members with `403`
- reject `viewer` with `403`
- load the project and all tasks for that project
- map each task into an Airtable record payload
- export each task through a shared Airtable service
- return JSON summary for success or partial success

Suggested response shape:

```ts
type ExportResult = {
  total: number;
  created: number;
  updated: number;
  failed: number;
  failures: Array<{
    taskId: string;
    taskTitle: string;
    message: string;
    permanent: boolean;
  }>;
};
```

### 2. Add a real Airtable service wrapper

Create a new server-only helper in `src/lib`, for example `src/lib/airtable.ts`.

Responsibilities:
- initialize the official `airtable` client from env vars
- expose a narrow interface the route can call
- isolate retry logic and error classification from the route
- use Airtable metadata APIs to inspect the target table schema
- create missing required fields automatically when Airtable reports missing-column errors
- support test injection so unit tests can swap in `src/lib/airtable-mock.ts`

Suggested service surface:

```ts
type ExportTaskInput = {
  project: {
    id: string;
    name: string;
  };
  task: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    position: number;
    assigneeName: string | null;
    createdAt: string;
    updatedAt: string;
  };
};

type UpsertOutcome = "created" | "updated";

interface AirtableExportClient {
  upsertTask(input: ExportTaskInput): Promise<UpsertOutcome>;
}
```

### 3. Make reruns idempotent

Do not create duplicate Airtable rows on repeated export runs.

Recommended strategy:
- add a stable field in Airtable such as `TaskBoard Task ID`
- before create, look up an existing Airtable record by that field
- if found, update it
- if not found, create it

Notes:
- avoid relying on Airtable record IDs because the app does not persist them locally
- the stable external key should always be the app task ID
- project ID can also be exported for filtering/debugging

### 4. Retry transient Airtable failures only

Classify Airtable failures into:
- transient: rate limit, timeout, network error, 5xx
- schema-recoverable: missing required Airtable fields that the exporter knows how to create
- permanent: validation errors, auth errors, missing base/table, unsupported schema errors, 4xx other than rate limit

Behavior:
- retry transient errors with bounded retry count, for example 3 attempts
- use short backoff between attempts
- if Airtable reports missing known field names such as `TaskBoard Task ID` or `Status`, create those fields through the metadata API and retry the upsert
- do not retry permanent errors
- collect task-level failures and continue exporting remaining tasks

### 5. Task-to-Airtable field mapping

Export a consistent field set, for example:
- `TaskBoard Task ID`
- `Project ID`
- `Project Name`
- `Title`
- `Description`
- `Status`
- `Position`
- `Assignee`
- `Created At`
- `Updated At`

Important:
- keep the mapping centralized in the Airtable service, not inline in the route
- normalize nullable values to formats Airtable accepts
- define the required field list centrally so metadata auto-create and record mapping stay in sync

## Frontend Changes

### 1. Add export action to project page

Update `src/app/projects/[id]/page.tsx`.

Behavior:
- add an export button near the project header
- only render it for `admin` or `member`
- on click, call `POST /api/projects/:id/export-airtable`
- disable the button while export is in progress
- show a concise status message after completion

Suggested UX states:
- idle: `Export to Airtable`
- pending: `Exporting...`
- success: summary like `Exported 42 tasks: 30 created, 12 updated`
- partial failure: show counts and a short failure summary
- error: show the server error message

### 2. Keep UI authorization secondary

The UI should hide the button for viewers, but the server remains the source of truth.

## Configuration

Use environment variables already aligned with the repo:
- `AIRTABLE_API_KEY`
- `AIRTABLE_BASE_ID`
- `AIRTABLE_TABLE_NAME`

Additions:
- validate these in the Airtable service before making calls
- fail fast with a clear configuration error if any are missing
- prefer using the Airtable table ID in `AIRTABLE_TABLE_NAME` instead of the display name, because it is resilient to renames

## Testing Plan

### Unit tests for Airtable service

Use `src/lib/airtable-mock.ts` as the test double.

Cover:
- create on first export
- update on repeated export of the same task
- transient failure retries then success
- permanent failure without retry
- one record failure does not stop later records
- missing-field Airtable errors are parsed correctly and mapped to required field definitions
- fetch-style/non-`Error` Airtable failures surface useful messages

### Route tests for `POST /api/projects/:id/export-airtable`

Cover:
- `401` when unauthenticated
- `403` for non-member
- `403` for viewer
- `200` with summary for admin/member
- partial failure response when one task export fails
- route calls the Airtable export client once per task

### UI tests for project page

Cover:
- export button visible for `admin` and `member`
- export button hidden for `viewer`
- clicking export calls the endpoint
- loading and result states render correctly
- partial failure summaries surface the first actionable failure message

## Manual Verification

1. Set valid Airtable credentials in `.env`.
2. Point `AIRTABLE_TABLE_NAME` to the target table, preferably by Airtable table ID.
3. Start the app and log in as an `admin` or `member`.
4. Open a project detail page and click `Export to Airtable`.
5. Confirm the UI shows a success or partial-success summary.
6. Open the real Airtable base and verify the tasks are visible.
7. Run export a second time and confirm the same tasks are updated rather than duplicated.
8. Optionally delete one export field such as `Status`, rerun export, and confirm the exporter recreates it automatically.

## Implementation Notes

- Prefer a shared helper to fetch a project with tasks for export instead of duplicating query logic in multiple places.
- Keep Airtable integration server-only; do not expose Airtable credentials to the client.
- Process tasks sequentially first for simplicity and predictable retry behavior. Parallel export can be an optional later improvement.
- Return HTTP `200` for partial success with failure details in the body, since the run completed overall.
- Treat Airtable schema healing as part of the export path, not a separate manual prerequisite.
