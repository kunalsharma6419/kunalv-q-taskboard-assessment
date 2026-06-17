# How To Test Airtable Export End To End

This guide covers the real Airtable export feature from the project detail page.

It verifies:
- only `admin` and `member` users can trigger export
- tasks are pushed to a real Airtable base
- rerunning export updates existing rows instead of duplicating them
- transient/per-record failures are handled gracefully
- missing Airtable columns are created automatically

## 1. Prerequisites

Make sure your Airtable personal access token has:
- `data.records:read`
- `data.records:write`
- `schema.bases:read`
- `schema.bases:write`

Make sure the token can access the same base you want to export into.

## 2. Configure `.env`

Set these values:

```env
AIRTABLE_API_KEY=your_real_airtable_token
AIRTABLE_BASE_ID=app6rQwBedGbc7azw
AIRTABLE_TABLE_NAME=tblZ0oQxwMBA5RUe8
```

Notes:
- using the table ID is safer than using the display name
- the table ID from your Airtable URL is `tblZ0oQxwMBA5RUe8`

## 3. Prepare the app

Apply database migrations:

```bash
npx.cmd prisma migrate deploy
```

Seed demo data if needed:

```bash
npm.cmd run db:seed
```

Start the app:

```bash
npm.cmd run dev
```

Open:

```text
http://localhost:3000
```

## 4. Recommended test accounts

Use the seeded users:

- `meera@taskboard.dev` / `password123` -> admin on `Q3 Launch`
- `arjun@taskboard.dev` / `password123` -> member on `Q3 Launch`
- `dev@example.com` / `password123` -> viewer on `Q3 Launch`

## 5. Automated checks

Run the full test suite:

```bash
npm.cmd test
```

Run typecheck:

```bash
npm.cmd run typecheck
```

These cover:
- export service retry and idempotency
- route authorization
- UI trigger behavior
- partial failure handling
- missing-field detection logic

## 6. UI test: admin or member can export

1. Log in as `meera@taskboard.dev` or `arjun@taskboard.dev`.
2. Open the `Q3 Launch` project.
3. Confirm the `Export to Airtable` button is visible near the top of the page.
4. Click `Export to Airtable`.
5. Wait for the status message.

Expected result:
- the button becomes disabled while export is running
- after completion, the page shows a summary like:

```text
Exported 7 tasks: X created, Y updated, Z failed
```

## 7. UI test: viewer cannot export

1. Log in as `dev@example.com`.
2. Open the `Q3 Launch` project.

Expected result:
- the `Export to Airtable` button is not shown

## 8. Verify rows in Airtable

Open your real Airtable base:

```text
https://airtable.com/app6rQwBedGbc7azw/tblZ0oQxwMBA5RUe8/viwzS0EJNvEqNdUer?blocks=hide
```

Expected result:
- one row per exported task
- no duplicates for the same TaskBoard task
- the rows include fields like:
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

## 9. Verify rerun behavior

1. Trigger export once.
2. Confirm rows appear in Airtable.
3. Trigger export again without changing tasks.

Expected result:
- no duplicate rows are created
- the second run should mostly report `updated` instead of `created`

Example expected summary:

```text
Exported 7 tasks: 0 created, 7 updated, 0 failed
```

## 10. Verify update behavior

1. In the app, edit one task title or status.
2. Save the task.
3. Trigger export again.
4. Refresh Airtable.

Expected result:
- the existing Airtable row for that task is updated
- the row is matched by `TaskBoard Task ID`
- no new duplicate row appears

## 11. Verify automatic column creation

This is the important schema-healing test.

### Option A: New/empty table

1. Create a fresh Airtable table with no matching export columns.
2. Point `AIRTABLE_TABLE_NAME` to that table’s ID.
3. Restart the app.
4. Trigger export.

Expected result:
- the exporter automatically creates missing columns
- the export succeeds without you manually creating `Status`, `TaskBoard Task ID`, etc.

### Option B: Delete a single field

1. In Airtable, delete one of the export fields, for example `Status`.
2. Trigger export again.

Expected result:
- the exporter detects the missing field
- it creates the column again automatically
- export retries and succeeds

## 12. Manual API test

### Login as a member

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"arjun@taskboard.dev\",\"password\":\"password123\"}"
```

Copy the token as `<member-token>`.

### List projects

```bash
curl http://localhost:3000/api/projects \
  -H "Authorization: Bearer <member-token>"
```

Copy the project ID for `Q3 Launch`.

### Trigger export

```bash
curl -X POST http://localhost:3000/api/projects/<project-id>/export-airtable \
  -H "Authorization: Bearer <member-token>"
```

Expected result:
- HTTP `200`
- response body includes:

```json
{
  "result": {
    "total": 7,
    "created": 7,
    "updated": 0,
    "failed": 0,
    "failures": []
  }
}
```

The exact counts may differ on reruns.

## 13. Negative API tests

### Viewer should be blocked

Login as viewer:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"dev@example.com\",\"password\":\"password123\"}"
```

Then try export:

```bash
curl -X POST http://localhost:3000/api/projects/<project-id>/export-airtable \
  -H "Authorization: Bearer <viewer-token>"
```

Expected result:

```json
{
  "error": "viewers cannot export tasks"
}
```

Expected status:
- HTTP `403`

### Missing Airtable permissions

If you remove `schema.bases:write` or use a base the token cannot access:

Expected result:
- export fails cleanly
- the response or UI message shows the actual Airtable permission error

## 14. What success looks like

A full successful end-to-end run means:
- the button is visible only for `admin` and `member`
- export runs from the project page
- rows appear in the real Airtable base
- reruns do not create duplicates
- task changes sync into existing Airtable rows
- missing Airtable columns are created automatically
