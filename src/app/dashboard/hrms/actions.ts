"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { AttendanceStatus, LeaveStatus } from "@prisma/client";
import { logActivity } from "@/lib/activityLog";
import { requireSession } from "@/lib/auth";

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function markAttendance(staffId: string, status: AttendanceStatus) {
  const session = await requireSession();
  const staff = await prisma.staff.findFirst({ where: { id: staffId, organizationId: session.organizationId } });
  if (!staff) return;

  await prisma.attendance.upsert({
    where: { staffId_date: { staffId, date: today() } },
    update: { status },
    create: { staffId, date: today(), status },
  });
  await logActivity({
    category: "HRMS",
    action: "ATTENDANCE_MARKED",
    description: `Marked ${staff.name} as ${status.replaceAll("_", " ")} for today`,
    targetType: "Staff",
    targetId: staffId,
    metadata: { status },
    organizationId: session.organizationId,
  });
  revalidatePath("/dashboard/hrms");
}

export async function updateLeaveStatus(leaveId: string, status: LeaveStatus) {
  const session = await requireSession();
  const leave = await prisma.leave.findFirst({
    where: { id: leaveId, staff: { organizationId: session.organizationId } },
    include: { staff: true },
  });
  if (!leave) return;

  await prisma.leave.update({ where: { id: leaveId }, data: { status } });
  await logActivity({
    category: "HRMS",
    action: "LEAVE_STATUS_UPDATED",
    description: `${leave.staff.name}'s leave request was ${status.toLowerCase()}`,
    targetType: "Leave",
    targetId: leaveId,
    metadata: { status },
    organizationId: session.organizationId,
  });
  revalidatePath("/dashboard/hrms");
}

export async function addStaff(formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") || "").trim();
  const designation = String(formData.get("designation") || "").trim();
  const department = String(formData.get("department") || "").trim();
  const email = String(formData.get("email") || "").trim();
  if (!name || !email) return;

  const staff = await prisma.staff.create({
    data: { name, designation, department, email, organizationId: session.organizationId },
  });
  await logActivity({
    category: "HRMS",
    action: "STAFF_ADDED",
    description: `Added new staff member ${name} (${designation})`,
    targetType: "Staff",
    targetId: staff.id,
    organizationId: session.organizationId,
  });
  revalidatePath("/dashboard/hrms");
}
