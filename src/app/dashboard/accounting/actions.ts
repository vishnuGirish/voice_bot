"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { InvoiceStatus, ExpenseCategory } from "@prisma/client";
import { logActivity } from "@/lib/activityLog";

export async function addInvoice(formData: FormData) {
  const number = String(formData.get("number") || "").trim();
  const clientId = String(formData.get("clientId") || "");
  const amount = Number(formData.get("amount") || 0);
  if (!number || !clientId) return;

  const invoice = await prisma.invoice.create({ data: { number, clientId, amount } });
  await logActivity({
    category: "ACCOUNTING",
    action: "INVOICE_CREATED",
    description: `Created invoice ${number} for ₹${amount.toLocaleString("en-IN")}`,
    targetType: "Invoice",
    targetId: invoice.id,
  });
  revalidatePath("/dashboard/accounting");
}

export async function updateInvoiceStatus(invoiceId: string, status: InvoiceStatus) {
  const invoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status, paidAt: status === "PAID" ? new Date() : null },
  });
  await logActivity({
    category: "ACCOUNTING",
    action: "INVOICE_STATUS_CHANGED",
    description: `Invoice ${invoice.number} marked as ${status}`,
    targetType: "Invoice",
    targetId: invoiceId,
    metadata: { status },
  });
  revalidatePath("/dashboard/accounting");
}

export async function addExpense(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const amount = Number(formData.get("amount") || 0);
  const category = String(formData.get("category") || "OTHER") as ExpenseCategory;
  if (!title) return;

  const expense = await prisma.expense.create({ data: { title, amount, category } });
  await logActivity({
    category: "ACCOUNTING",
    action: "EXPENSE_LOGGED",
    description: `Logged expense "${title}" for ₹${amount.toLocaleString("en-IN")} (${category})`,
    targetType: "Expense",
    targetId: expense.id,
  });
  revalidatePath("/dashboard/accounting");
}
