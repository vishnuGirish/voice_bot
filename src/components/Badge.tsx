const COLORS: Record<string, string> = {
  green: "bg-emerald-500/15 text-emerald-300",
  red: "bg-red-500/15 text-red-300",
  yellow: "bg-amber-500/15 text-amber-300",
  blue: "bg-sky-500/15 text-sky-300",
  purple: "bg-violet-500/15 text-violet-300",
  gray: "bg-zinc-500/15 text-zinc-300",
};

export default function Badge({ text, color = "gray" }: { text: string; color?: keyof typeof COLORS }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${COLORS[color]}`}>
      {text}
    </span>
  );
}
