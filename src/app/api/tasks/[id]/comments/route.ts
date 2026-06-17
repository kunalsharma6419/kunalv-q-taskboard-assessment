import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  badRequest,
  canEditTasks,
  forbidden,
  getCurrentUser,
  getProjectMembership,
  notFound,
  unauthorized,
} from "@/lib/auth";
import { createTaskCommentSchema } from "@/schemas/task";

type Params = { params: Promise<{ id: string }> };

const safeUserSelect = { id: true, email: true, name: true } as const;

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createTaskCommentSchema.safeParse(body);
  if (!parsed.success) return badRequest("invalid input", parsed.error.flatten());

  const task = await prisma.task.findUnique({
    where: { id },
    select: { id: true, projectId: true },
  });
  if (!task) return notFound("task not found");

  const membership = await getProjectMembership(user.id, task.projectId);
  if (!membership) return forbidden("you are not a member of this project");
  if (!canEditTasks(membership.role)) {
    return forbidden("viewers cannot post comments");
  }

  const comment = await prisma.taskComment.create({
    data: {
      taskId: task.id,
      authorId: user.id,
      body: parsed.data.body,
    },
    include: {
      author: { select: safeUserSelect },
    },
  });

  return NextResponse.json({ comment }, { status: 201 });
}
