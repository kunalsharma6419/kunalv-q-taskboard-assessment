# How To Test Task Comments

This guide covers the new task comments feature:
- comments are shown in chronological order
- `admin` and `member` users can post comments
- `viewer` users can read comments but cannot post
- comments are append-only

## 1. Run the automated tests

From the repo root:

```bash
npm.cmd test
```

This includes coverage for:
- comment schema validation
- comment API authorization
- project detail payload with ordered comments
- task modal comment rendering and posting behavior

You can also run just the comment-focused tests:

```bash
npm.cmd test -- src/tests/task-comments-route.test.ts src/tests/project-detail-route.test.ts src/tests/TaskDetail.test.tsx
```

## 2. Make sure the database is up to date

Apply the Prisma migration:

```bash
npx.cmd prisma migrate deploy
```

If needed, regenerate the Prisma client:

```bash
npx.cmd prisma generate
```

## 3. Seed demo data

If you want known sample users and starter comments:

```bash
npm.cmd run db:seed
```

Seeded users:
- `meera@taskboard.dev` / `password123` -> admin on Q3 Launch
- `arjun@taskboard.dev` / `password123` -> member on Q3 Launch, admin on Onboarding
- `dev@example.com` / `password123` -> viewer on Q3 Launch

## 4. Start the app

```bash
npm.cmd run dev
```

Open `http://localhost:3000`.

## 5. Manual UI test

### Admin or member can post
1. Log in as `meera@taskboard.dev` or `arjun@taskboard.dev`.
2. Open a project and click any task.
3. In the task modal, scroll to the `comments` section.
4. Confirm existing comments appear oldest first.
5. Enter a new comment and click `post comment`.
6. Confirm:
   - the input clears
   - the comment appears in the thread
   - no edit/delete controls exist

### Viewer can read but not post
1. Log in as `dev@example.com`.
2. Open the `Q3 Launch` project and click a task.
3. Confirm the comment thread is visible.
4. Confirm there is no comment textarea or post button.
5. Confirm the message says viewers can read comments but cannot post.

## 6. Manual API test

### Login as a member

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"arjun@taskboard.dev\",\"password\":\"password123\"}"
```

Copy the returned token as `<member-token>`.

### Find a project and task

```bash
curl http://localhost:3000/api/projects \
  -H "Authorization: Bearer <member-token>"
```

Then fetch one project:

```bash
curl http://localhost:3000/api/projects/<project-id> \
  -H "Authorization: Bearer <member-token>"
```

Pick a task ID from the `tasks` array.

### Post a comment as a member

```bash
curl -X POST http://localhost:3000/api/tasks/<task-id>/comments \
  -H "Authorization: Bearer <member-token>" \
  -H "Content-Type: application/json" \
  -d "{\"body\":\"Posting a manual verification comment.\"}"
```

Expected result:
- HTTP `201`
- response contains `comment.id`, `comment.body`, `comment.createdAt`, and `comment.author`

### Confirm it appears in project detail

```bash
curl http://localhost:3000/api/projects/<project-id> \
  -H "Authorization: Bearer <member-token>"
```

Expected result:
- the task now includes the new comment
- comments are in chronological order

### Try posting as a viewer

Login as viewer:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"dev@example.com\",\"password\":\"password123\"}"
```

Copy the token as `<viewer-token>`, then try:

```bash
curl -X POST http://localhost:3000/api/tasks/<task-id>/comments \
  -H "Authorization: Bearer <viewer-token>" \
  -H "Content-Type: application/json" \
  -d "{\"body\":\"Viewer should not be able to post this.\"}"
```

Expected result:

```json
{
  "error": "viewers cannot post comments"
}
```

Expected status:
- HTTP `403`

## 7. Negative checks

Blank comment body should fail:

```bash
curl -X POST http://localhost:3000/api/tasks/<task-id>/comments \
  -H "Authorization: Bearer <member-token>" \
  -H "Content-Type: application/json" \
  -d "{\"body\":\"   \"}"
```

Expected result:
- HTTP `400`
- response contains `error: "invalid input"`

Posting to a missing task should fail:

```bash
curl -X POST http://localhost:3000/api/tasks/not-a-real-task/comments \
  -H "Authorization: Bearer <member-token>" \
  -H "Content-Type: application/json" \
  -d "{\"body\":\"test\"}"
```

Expected result:
- HTTP `404`
- response contains `error: "task not found"`

## 8. What should never exist

These behaviors are intentionally unsupported:
- editing an existing comment
- deleting an existing comment
- any UI control for comment mutation after creation
