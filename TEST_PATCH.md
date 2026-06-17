# How To Test The Task Update Authorization Fix

This patch fixes a security bug where a `viewer` could update tasks through `PATCH /api/tasks/:id`.

## 1. Run the automated tests

From the repo root:

```bash
npm.cmd test -- src/tests/task-route.test.ts
```

What this verifies:
- a `viewer` receives `403`
- a permitted user such as a `member` can still update a task

You can also run the full suite:

```bash
npm.cmd test
```

## 2. Start the app

If the app is not already running:

```bash
npm.cmd run dev
```

The API should be available at `http://localhost:3000`.

## 3. Login as a viewer

Use the seeded viewer account:

- email: `dev@example.com`
- password: `password123`

Login:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"dev@example.com\",\"password\":\"password123\"}"
```

Copy the returned `token`.

## 4. Find a project and task ID

List the viewer's projects:

```bash
curl http://localhost:3000/api/projects \
  -H "Authorization: Bearer <viewer-token>"
```

Then fetch the project detail:

```bash
curl http://localhost:3000/api/projects/<project-id> \
  -H "Authorization: Bearer <viewer-token>"
```

Copy one of the task IDs from the `tasks` array.

## 5. Verify the fix manually

Try to update the task as the viewer:

```bash
curl -X PATCH http://localhost:3000/api/tasks/<task-id> \
  -H "Authorization: Bearer <viewer-token>" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Viewer edited this task\"}"
```

Expected response:

```json
{
  "error": "viewers cannot update tasks"
}
```

Expected behavior:
- HTTP status should be `403`
- the task should remain unchanged

## 6. Optional: verify an allowed role still works

Login as a member:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"arjun@taskboard.dev\",\"password\":\"password123\"}"
```

Then update the same task with the member token:

```bash
curl -X PATCH http://localhost:3000/api/tasks/<task-id> \
  -H "Authorization: Bearer <member-token>" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Member update works\"}"
```

Expected result:
- the request succeeds
- the response contains the updated task

## 7. Confirm the final task state

Fetch the project again:

```bash
curl http://localhost:3000/api/projects/<project-id> \
  -H "Authorization: Bearer <member-token>"
```

Check that:
- the viewer request did not change the task
- the member request did change the task
