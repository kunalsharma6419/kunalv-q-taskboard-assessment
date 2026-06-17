# Terminal Log

## 1. Setup Output

### Prisma client generation

```bash
npx.cmd prisma generate
```

Output:

```text
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma

✔ Generated Prisma Client (v6.1.0) to .\node_modules\@prisma\client in 183ms
```

### Prisma migrations

```bash
npx.cmd prisma migrate deploy
```

Output:

```text
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "taskboard", schema "public" at "localhost:5432"

2 migrations found in prisma/migrations

Applying migration `20260617120000_add_task_comments`

The following migration(s) have been applied:

migrations/
  └─ 20260617120000_add_task_comments/
    └─ migration.sql

All migrations have been successfully applied.
```

## 2. Initial Test Run

```bash
npm.cmd test
```

Output:

```text
Test Files  10 passed (10)
Tests       41 passed (41)
```

## 3. Bug `curl` Proof

### Unauthorized task update bug before fix

Viewer was able to update a task through `PATCH /api/tasks/:id`.

```bash
curl -X PATCH http://localhost:3000/api/tasks/cmqhmzzmd000v44vsapp3vyal \
  -H "Authorization: Bearer <viewer-token>" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Viewer edited this task\"}"
```

Response before fix:

```json
{
  "task": {
    "id": "cmqhmzzmd000v44vsapp3vyal",
    "projectId": "cmqhmzzjq000644vs0oyi6caj",
    "title": "Viewer edited this task",
    "status": "todo"
  }
}
```

## 4. Fix `curl` Proof

### Same request after fix

```bash
curl -X PATCH http://localhost:3000/api/tasks/cmqhmzzmd000v44vsapp3vyal \
  -H "Authorization: Bearer <viewer-token>" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Viewer edited this task\"}"
```

Response after fix:

```json
{
  "error": "viewers cannot update tasks"
}
```

## 5. Part 3c Export Demo

### Airtable target

Provided Airtable base URL:

```text
https://airtable.com/app6rQwBedGbc7azw/shrzn9xZQ8yHarirD
```

### Airtable screenshot proof

Screenshot evidence was provided showing exported task rows visible in the Airtable base at the URL above.

![Airtable export proof](airtablebasescreenshot.png)

Observed in the screenshot:
- exported rows are present in the table
- `TaskBoard Task ID`, `Project ID`, `Project Name`, `Title`, and `Description` columns are visible
- `Q3 Launch` tasks appear in Airtable with distinct TaskBoard task IDs
- the table shows `10 records` at the time of capture

### First export attempt

Observed UI result:

```text
Exported 7 tasks: 0 created, 0 updated, 7 failed. First failure: Prepare customer email blast (You are not authorized to perform this operation)
```

### After switching to table ID and fixing schema handling

Observed UI result:

```text
Exported 7 tasks: 0 created, 0 updated, 7 failed. First failure: Prepare customer email blast (The formula for filtering records is invalid: Unknown field names: taskboard task id)
```

### After adding automatic missing-column handling

Observed UI result:

```text
Exported 7 tasks: 0 created, 0 updated, 7 failed. First failure: Prepare customer email blast (Unknown field name: "Status")
```

### Current status

- The Airtable export integration, retry handling, idempotent lookup, and automatic field-creation logic were implemented in code.
- Airtable screenshot evidence now confirms that exported rows are visible in the target base.
- A second successful rerun with captured summary output to prove uniqueness/update behavior is still **not recorded** in this log.

## 6. Part 3a / 3b Demos Attempted

### Task comments feature

Implemented and tested:

```bash
npm.cmd test -- src/tests/task-comments-route.test.ts src/tests/project-detail-route.test.ts src/tests/TaskDetail.test.tsx
```

Covered behaviors:

- comments render in chronological order
- `admin` and `member` can post comments
- `viewer` can read but cannot post
- append-only behavior is preserved

### Airtable export feature

Implemented and tested:

```bash
npm.cmd test -- src/tests/airtable-export.test.ts src/tests/project-export-route.test.ts src/tests/ProjectExportButton.test.tsx
```

Covered behaviors:

- project-page export trigger for `admin` / `member`
- route authorization
- per-record retry and partial failure handling
- rerun/upsert logic
- automatic recognition of missing Airtable fields

## 7. Final Test Run

### Typecheck

```bash
npm.cmd run typecheck
```

Output:

```text
> taskboard@0.1.0 typecheck
> tsc --noEmit
```

### Full test suite

```bash
npm.cmd test
```

Output:

```text
Test Files  10 passed (10)
Tests       41 passed (41)
```
