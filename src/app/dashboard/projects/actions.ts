"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { TaskStatus } from "@prisma/client";
import { logActivity } from "@/lib/activityLog";
import { requireSession } from "@/lib/auth";

export async function addProject(formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") || "").trim();
  const clientId = String(formData.get("clientId") || "") || null;
  if (!name) return;

  if (clientId) {
    const client = await prisma.client.findFirst({ where: { id: clientId, organizationId: session.organizationId } });
    if (!client) return;
  }

  const project = await prisma.project.create({
    data: { name, clientId, organizationId: session.organizationId },
  });
  await logActivity({
    category: "PROJECTS",
    action: "PROJECT_CREATED",
    description: `Created project "${name}"`,
    targetType: "Project",
    targetId: project.id,
    organizationId: session.organizationId,
  });
  revalidatePath("/dashboard/projects");
}

export async function addTask(projectId: string, formData: FormData) {
  const session = await requireSession();
  const project = await prisma.project.findFirst({ where: { id: projectId, organizationId: session.organizationId } });
  if (!project) return;

  const title = String(formData.get("title") || "").trim();
  const assigneeId = String(formData.get("assigneeId") || "") || null;
  if (!title) return;

  if (assigneeId) {
    const staff = await prisma.staff.findFirst({ where: { id: assigneeId, organizationId: session.organizationId } });
    if (!staff) return;
  }

  const task = await prisma.task.create({ data: { projectId, title, assigneeId } });
  await logActivity({
    category: "PROJECTS",
    action: "TASK_ADDED",
    description: `Added task "${title}"`,
    targetType: "Task",
    targetId: task.id,
    organizationId: session.organizationId,
  });
  revalidatePath("/dashboard/projects");
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const session = await requireSession();
  const task = await prisma.task.findFirst({
    where: { id: taskId, project: { organizationId: session.organizationId } },
  });
  if (!task) return;

  await prisma.task.update({ where: { id: taskId }, data: { status } });
  await logActivity({
    category: "PROJECTS",
    action: "TASK_STATUS_CHANGED",
    description: `Task "${task.title}" moved to ${status.replaceAll("_", " ")}`,
    targetType: "Task",
    targetId: taskId,
    metadata: { status },
    organizationId: session.organizationId,
  });
  revalidatePath("/dashboard/projects");
}
