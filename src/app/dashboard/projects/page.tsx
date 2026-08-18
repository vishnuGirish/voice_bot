import { prisma } from "@/lib/db";
import Badge from "@/components/Badge";
import { addProject, addTask, updateTaskStatus } from "./actions";
import type { TaskStatus } from "@prisma/client";
import AutoSubmitSelect from "@/components/AutoSubmitSelect";
import { requireSession } from "@/lib/auth";

const TASK_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];

const statusColor: Record<string, "green" | "blue" | "yellow" | "gray"> = {
  ACTIVE: "green",
  PLANNED: "blue",
  ON_HOLD: "yellow",
  COMPLETED: "gray",
};

export default async function ProjectsPage() {
  const session = await requireSession();
  const [projects, clients, staff] = await Promise.all([
    prisma.project.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "desc" },
      include: { client: true, tasks: { include: { assignee: true } } },
    }),
    prisma.client.findMany({ where: { organizationId: session.organizationId }, orderBy: { name: "asc" } }),
    prisma.staff.findMany({
      where: { active: true, organizationId: session.organizationId },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-white">Projects</h1>
        <p className="text-sm text-zinc-500">Track delivery across clients.</p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-300">New project</h2>
        <form action={addProject} className="grid max-w-2xl grid-cols-2 gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <input name="name" placeholder="Project name" required className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
          <select name="clientId" className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500">
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button className="col-span-2 rounded-lg bg-sky-500 py-2 text-sm font-medium text-white hover:bg-sky-400">
            Create project
          </button>
        </form>
      </section>

      <div className="space-y-6">
        {projects.map((project) => (
          <section key={project.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">{project.name}</p>
                <p className="text-xs text-zinc-500">{project.client?.name ?? "No client"}</p>
              </div>
              <Badge text={project.status} color={statusColor[project.status]} />
            </div>

            <div className="space-y-1.5">
              {project.tasks.length === 0 && <p className="text-xs text-zinc-600">No tasks yet.</p>}
              {project.tasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between rounded-lg bg-zinc-950/50 px-3 py-2 text-sm">
                  <div>
                    <p className="text-zinc-100">{task.title}</p>
                    <p className="text-xs text-zinc-500">{task.assignee?.name ?? "Unassigned"}</p>
                  </div>
                  <form
                    action={async (formData) => {
                      "use server";
                      await updateTaskStatus(task.id, formData.get("status") as TaskStatus);
                    }}
                  >
                    <AutoSubmitSelect
                      name="status"
                      defaultValue={task.status}
                      className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                      options={TASK_STATUSES.map((s) => ({ value: s, label: s.replaceAll("_", " ") }))}
                    />
                  </form>
                </div>
              ))}
            </div>

            <form
              action={async (formData) => {
                "use server";
                await addTask(project.id, formData);
              }}
              className="mt-3 flex gap-2"
            >
              <input
                name="title"
                placeholder="New task title"
                required
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-white outline-none focus:border-sky-500"
              />
              <select name="assigneeId" className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-white outline-none focus:border-sky-500">
                <option value="">Unassigned</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button className="rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-500/25">
                Add task
              </button>
            </form>
          </section>
        ))}
      </div>
    </div>
  );
}
