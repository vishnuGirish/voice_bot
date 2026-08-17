"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { TaskStatus } from "@prisma/client";
import { logActivity } from "@/lib/activityLog";

export async function addProject(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const clientId = String(formData.get("clientId") || "") || null;
  if (!name) return;

  const project = await prisma.project.create({ data: { name, clientId } });
  await logActivity({
    category: "PROJECTS",
    action: "PROJECT_CREATED",
    description: `Created project "${name}"`,
    targetType: "Project",
    targetId: project.id,
  });
  revalidatePath("/dashboard/projects");
}

export async function addTask(projectId: string, formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const assigneeId = String(formData.get("assigneeId") || "") || null;
  if (!title) return;

  const task = await prisma.task.create({ data: { projectId, title, assigneeId } });
  await logActivity({
    category: "PROJECTS",
    action: "TASK_ADDED",
    description: `Added task "${title}"`,
    targetType: "Task",
    targetId: task.id,
  });
  revalidatePath("/dashboard/projects");
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const task = await prisma.task.update({ where: { id: taskId }, data: { status } });
  await logActivity({
    category: "PROJECTS",
    action: "TASK_STATUS_CHANGED",
    description: `Task "${task.title}" moved to ${status.replaceAll("_", " ")}`,
    targetType: "Task",
    targetId: taskId,
    metadata: { status },
  });
  revalidatePath("/dashboard/projects");
}
