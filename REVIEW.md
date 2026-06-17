# Review Findings

## 1. `PATCH /api/tasks/:id` lets any authenticated user edit any task
- File and line reference: `src/app/api/tasks/[id]/route.ts:18-33`
- Category: Security
- Severity: Critical
- Description: The update path verifies that the caller is authenticated, but it never checks whether the caller belongs to the task's project or whether their role permits edits. That means a viewer, or even a user from a different project who can guess a task ID, can change task titles, status, assignee, and position directly through the API.
- Recommended fix: After loading the task, fetch the caller's membership for `existing.projectId` and reject non-members and non-editors with the same `canEditTasks` guard already used by `DELETE`. Add API tests that cover viewer, member, admin, and non-member update attempts.

Repro with a viewer token:

```bash
curl -X PATCH http://localhost:3000/api/tasks/cmqhmzzmd000v44vsapp3vyal \
  -H "Authorization: Bearer <viewer-token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Viewer edited this task"}'
```

Response:

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

## 2. Project detail API leaks every member's `passwordHash`
- File and line reference: `src/app/api/projects/[id]/route.ts:25-35`
- Category: Security
- Severity: High
- Description: The project detail query includes `owner: true`, `user: true`, `assignee: true`, and `createdBy: true`, which serializes full `User` rows into the response. Any project member can therefore retrieve bcrypt password hashes for all members and task participants, dramatically expanding the blast radius of any client-side compromise or offline cracking attempt.
- Recommended fix: Replace all broad `true` user includes with explicit `select` clauses that return only safe fields such as `id`, `name`, and `email`. Add a regression test that asserts `passwordHash` is absent from every API payload.

## 3. Task search is vulnerable to SQL injection
- File and line reference: `src/app/api/projects/[id]/tasks/route.ts:25-34`
- Category: Security
- Severity: High
- Description: The search branch interpolates both `projectId` and `q` directly into a raw SQL string and executes it with `$queryRawUnsafe`. A crafted `q` value can alter the query, bypass intended filtering, or force database errors, turning a normal search endpoint into an attack surface against the production database.
- Recommended fix: Replace the raw string with Prisma filters or a parameterized `$queryRaw` query using bound variables. Add tests for quotes, wildcard-heavy input, and malicious payloads so the endpoint cannot regress back to string-built SQL.

## 4. User emails are not unique at the database layer, making authentication nondeterministic
- File and line reference: `prisma/schema.prisma:23-29`, `src/app/api/auth/register/route.ts:17-20`, `src/app/api/auth/login/route.ts:15-19`
- Category: Data Integrity
- Severity: High
- Description: `User.email` has no unique constraint, while both register and login rely on `findFirst({ where: { email } })`. Under concurrent signups or any direct data import, duplicate email rows can be created, after which login will authenticate whichever matching row Prisma returns first instead of a single canonical account.
- Recommended fix: Add a unique index on `User.email`, migrate existing duplicate data safely, and switch reads to `findUnique`. In registration, handle Prisma's unique-constraint error explicitly so concurrent requests fail cleanly instead of creating ambiguous identities.
