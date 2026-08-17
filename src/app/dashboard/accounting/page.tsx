import { prisma } from "@/lib/db";
import DataTable from "@/components/DataTable";
import Badge from "@/components/Badge";
import StatCard from "@/components/StatCard";
import { addInvoice, updateInvoiceStatus, addExpense } from "./actions";
import type { InvoiceStatus, ExpenseCategory } from "@prisma/client";
import { Wallet, TrendingDown, TrendingUp } from "lucide-react";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";

const INVOICE_STATUSES: InvoiceStatus[] = ["DRAFT", "SENT", "PAID", "OVERDUE"];
const EXPENSE_CATEGORIES: ExpenseCategory[] = ["RENT", "SALARY", "SOFTWARE", "TRAVEL", "MARKETING", "OTHER"];

const invoiceColor: Record<string, "gray" | "blue" | "green" | "red"> = {
  DRAFT: "gray",
  SENT: "blue",
  PAID: "green",
  OVERDUE: "red",
};

export default async function AccountingPage() {
  const [invoices, expenses, paidSum, expenseSum] = await Promise.all([
    prisma.invoice.findMany({ orderBy: { issuedAt: "desc" }, include: { client: true } }),
    prisma.expense.findMany({ orderBy: { incurredAt: "desc" }, take: 10 }),
    prisma.invoice.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
    prisma.expense.aggregate({ _sum: { amount: true } }),
  ]);
  const clients = await prisma.client.findMany({ orderBy: { name: "asc" } });

  const revenue = Number(paidSum._sum.amount ?? 0);
  const spend = Number(expenseSum._sum.amount ?? 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-white">Accounting</h1>
        <p className="text-sm text-zinc-500">Invoices, expenses and cash flow.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Revenue (paid)" value={`₹${revenue.toLocaleString("en-IN")}`} icon={TrendingUp} />
        <StatCard label="Expenses" value={`₹${spend.toLocaleString("en-IN")}`} icon={TrendingDown} />
        <StatCard label="Net" value={`₹${(revenue - spend).toLocaleString("en-IN")}`} icon={Wallet} />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Invoices</h2>
        <DataTable
          columns={[
            { header: "Number", render: (i) => i.number },
            { header: "Client", render: (i) => i.client.name },
            { header: "Amount", render: (i) => `₹${Number(i.amount).toLocaleString("en-IN")}` },
            { header: "Status", render: (i) => <Badge text={i.status} color={invoiceColor[i.status]} /> },
            {
              header: "Update",
              render: (i) => (
                <form
                  action={async (formData) => {
                    "use server";
                    await updateInvoiceStatus(i.id, formData.get("status") as InvoiceStatus);
                  }}
                >
                  <AutoSubmitSelect
                    name="status"
                    defaultValue={i.status}
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                    options={INVOICE_STATUSES.map((s) => ({ value: s, label: s }))}
                  />
                </form>
              ),
            },
          ]}
          rows={invoices}
        />
        <form action={addInvoice} className="mt-3 grid max-w-2xl grid-cols-2 gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <input name="number" placeholder="Invoice #" required className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
          <input name="amount" type="number" placeholder="Amount (₹)" required className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
          <select name="clientId" required className="col-span-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500">
            <option value="">Select client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button className="col-span-2 rounded-lg bg-sky-500 py-2 text-sm font-medium text-white hover:bg-sky-400">
            Create invoice
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Expenses</h2>
        <DataTable
          columns={[
            { header: "Title", render: (e) => e.title },
            { header: "Category", render: (e) => <Badge text={e.category} color="purple" /> },
            { header: "Amount", render: (e) => `₹${Number(e.amount).toLocaleString("en-IN")}` },
            { header: "Date", render: (e) => e.incurredAt.toLocaleDateString() },
          ]}
          rows={expenses}
        />
        <form action={addExpense} className="mt-3 grid max-w-2xl grid-cols-2 gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <input name="title" placeholder="Expense title" required className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
          <input name="amount" type="number" placeholder="Amount (₹)" required className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
          <select name="category" className="col-span-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500">
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button className="col-span-2 rounded-lg bg-sky-500 py-2 text-sm font-medium text-white hover:bg-sky-400">
            Log expense
          </button>
        </form>
      </section>
    </div>
  );
}
