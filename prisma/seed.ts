import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: "org_digitalize_default" },
    update: {},
    create: { id: "org_digitalize_default", name: "Digitalize" },
  });
  const organizationId = org.id;

  const passwordHash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@digitalize.app" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@digitalize.app",
      passwordHash,
      role: "ADMIN",
      organizationId,
    },
  });

  const staffData = [
    { name: "Arun Kumar", designation: "Software Engineer", department: "Engineering", email: "arun@digitalize.app" },
    { name: "Divya Shree", designation: "Project Manager", department: "Delivery", email: "divya@digitalize.app" },
    { name: "Karthik Raja", designation: "Sales Executive", department: "Sales", email: "karthik@digitalize.app" },
    { name: "Meena Iyer", designation: "HR Manager", department: "HR", email: "meena@digitalize.app" },
    { name: "Suresh Babu", designation: "Accountant", department: "Finance", email: "suresh@digitalize.app" },
    { name: "Priya Dharshini", designation: "UI/UX Designer", department: "Engineering", email: "priya@digitalize.app" },
  ];

  const staff = [];
  for (const s of staffData) {
    staff.push(
      await prisma.staff.upsert({
        where: { email: s.email },
        update: {},
        create: { ...s, organizationId },
      })
    );
  }

  // Attendance for today and yesterday
  const statuses = ["PRESENT", "PRESENT", "LATE", "PRESENT", "WORK_FROM_HOME", "PRESENT"] as const;
  for (const [i, s] of staff.entries()) {
    await prisma.attendance.upsert({
      where: { staffId_date: { staffId: s.id, date: daysAgo(0) } },
      update: {},
      create: { staffId: s.id, date: daysAgo(0), status: statuses[i] },
    });
  }

  await prisma.leave.createMany({
    data: [
      {
        staffId: staff[2].id,
        startDate: daysAgo(-1),
        endDate: daysAgo(-2),
        reason: "Family function",
        status: "PENDING",
      },
      {
        staffId: staff[5].id,
        startDate: daysAgo(3),
        endDate: daysAgo(1),
        reason: "Medical leave",
        status: "APPROVED",
      },
    ],
    skipDuplicates: true,
  });

  const clientsData = [
    { name: "Ravi Shankar", company: "VC Tech Admin", email: "ravi@vctech.com", phone: "9876543210" },
    { name: "Anitha Ramesh", company: "Select Booking Co", email: "anitha@selectbooking.com", phone: "9876543211" },
    { name: "Mohan Das", company: "ecommdocs.in", email: "mohan@ecommdocs.in", phone: "9876543212" },
  ];
  const clients = [];
  for (const c of clientsData) {
    const existing = await prisma.client.findFirst({ where: { email: c.email, organizationId } });
    clients.push(existing ?? (await prisma.client.create({ data: { ...c, organizationId } })));
  }

  await prisma.lead.createMany({
    data: [
      { organizationId, clientId: clients[0].id, title: "ERP rollout - Phase 2", value: 450000, stage: "NEGOTIATION", ownerName: "Karthik Raja" },
      { organizationId, clientId: clients[1].id, title: "Booking module license", value: 120000, stage: "PROPOSAL", ownerName: "Karthik Raja" },
      { organizationId, clientId: clients[2].id, title: "Docs automation add-on", value: 80000, stage: "NEW", ownerName: "Karthik Raja" },
      { organizationId, clientId: null, title: "Inbound - website demo request", value: 60000, stage: "CONTACTED", ownerName: "Karthik Raja" },
    ],
  });

  const project = await prisma.project.create({
    data: {
      organizationId,
      name: "VC Tech Admin Rollout",
      clientId: clients[0].id,
      status: "ACTIVE",
      startDate: daysAgo(20),
      dueDate: daysAgo(-30),
    },
  });

  await prisma.task.createMany({
    data: [
      { projectId: project.id, title: "Set up HRMS module", status: "DONE", assigneeId: staff[0].id },
      { projectId: project.id, title: "Integrate WAI assistant", status: "IN_PROGRESS", assigneeId: staff[0].id },
      { projectId: project.id, title: "Client training session", status: "TODO", assigneeId: staff[1].id },
    ],
  });

  await prisma.invoice.createMany({
    data: [
      { organizationId, number: "INV-1001", clientId: clients[0].id, amount: 150000, status: "PAID", paidAt: daysAgo(10) },
      { organizationId, number: "INV-1002", clientId: clients[1].id, amount: 45000, status: "OVERDUE", dueAt: daysAgo(5) },
      { organizationId, number: "INV-1003", clientId: clients[2].id, amount: 30000, status: "SENT", dueAt: daysAgo(-10) },
    ],
    skipDuplicates: true,
  });

  await prisma.expense.createMany({
    data: [
      { organizationId, title: "Office rent - August", category: "RENT", amount: 60000 },
      { organizationId, title: "Team salaries", category: "SALARY", amount: 320000 },
      { organizationId, title: "Cloud hosting", category: "SOFTWARE", amount: 15000 },
    ],
  });

  console.log("Seed complete. Login with admin@digitalize.app / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
