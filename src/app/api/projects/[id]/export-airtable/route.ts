import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  forbidden,
  getCurrentUser,
  getProjectMembership,
  notFound,
  unauthorized,
  canEditTasks,
} from "@/lib/auth";
import {
  AirtableConfigError,
  createAirtableExportClient,
  exportProjectTasksToAirtable,
} from "@/lib/airtable";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const membership = await getProjectMembership(user.id, id);
  if (!membership) return forbidden("you are not a member of this project");
  if (!canEditTasks(membership.role)) {
    return forbidden("viewers cannot export tasks");
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      tasks: {
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          position: true,
          createdAt: true,
          updatedAt: true,
          assignee: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: [{ status: "asc" }, { position: "asc" }],
      },
    },
  });

  if (!project) return notFound("project not found");

  try {
    const result = await exportProjectTasksToAirtable(
      {
        id: project.id,
        name: project.name,
      },
      project.tasks,
      createAirtableExportClient(),
    );

    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof AirtableConfigError
      ? error.message
      : error instanceof Error
        ? error.message
        : "airtable export failed";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
