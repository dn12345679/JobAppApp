import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sankey,
  Tooltip,
  XAxis,
  Layer,
  Rectangle,
} from "recharts";
import type { JobApplication } from "../../types";
import { listJobs } from "../../lib/db";

const TOOLTIP_STYLE = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  color: "var(--ink)",
  fontSize: 12,
};

// Auto-assigned tile colors for custom stages (cycled).
const STAGE_ACCENTS = [
  "text-indigo-300",
  "text-sky-300",
  "text-emerald-400",
  "text-rose-400",
  "text-fuchsia-300",
  "text-teal-300",
  "text-amber-300",
  "text-slate-400",
];

export default function StatsPage({
  workspaceId,
  refreshKey,
}: {
  workspaceId: string;
  refreshKey?: number;
}) {
  const [jobs, setJobs] = useState<JobApplication[]>([]);

  useEffect(() => {
    listJobs(workspaceId).then(setJobs);
  }, [workspaceId, refreshKey]);

  const c = useMemo(() => counts(jobs), [jobs]);
  const donut = useMemo(() => donutData(c), [c]);
  const weekday = useMemo(() => weekdayData(jobs), [jobs]);
  const sankey = useMemo(() => buildSankey(c), [c]);

  const stateTiles = [
    { label: "Total", value: jobs.length, accent: "text-slate-100" },
    { label: "Not applied", value: c.notApplied, accent: "text-slate-300" },
    { label: "In progress", value: c.inProgress, accent: "text-amber-300" },
    { label: "Applied", value: c.applied, accent: "text-emerald-300" },
  ];
  const stageTiles = Object.entries(c.stages).map(([label, value], i) => ({
    label,
    value,
    accent: STAGE_ACCENTS[i % STAGE_ACCENTS.length],
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* State tiles */}
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          States
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stateTiles.map((s, i) => (
            <Tile key={s.label} tile={s} delay={i * 0.03} />
          ))}
        </div>
      </div>

      {/* Stage tiles (breakdown of Applied) */}
      {stageTiles.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Applied · stages
          </h3>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {stageTiles.map((s, i) => (
              <Tile key={s.label} tile={s} delay={i * 0.03} />
            ))}
          </div>
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 p-10 text-center text-slate-600">
          Add applications to see charts here.
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Application states">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={donut}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {donut.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <Legend items={donut} />
            </Card>

            <Card title="Applications by weekday">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={weekday}>
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "var(--muted)", fontSize: 12 }}
                    axisLine={{ stroke: "var(--line)" }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ fill: "var(--line)", fillOpacity: 0.25 }}
                  />
                  <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card title="Application flow">
            {sankey ? (
              <ResponsiveContainer width="100%" height={280}>
                <Sankey
                  data={sankey}
                  nodeWidth={14}
                  nodePadding={26}
                  iterations={64}
                  margin={{ left: 8, right: 120, top: 12, bottom: 12 }}
                  link={<SankeyLink />}
                  node={<SankeyNode />}
                >
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </Sankey>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-slate-600">
                Not enough data yet for a flow diagram.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

// ---- Sankey custom node (renders a labelled rectangle) ----------------------

function SankeyNode(props: any) {
  const { x, y, width, height, index, payload, containerWidth } = props;
  const isRight = x + width + 6 > containerWidth - 120;
  return (
    <Layer key={`node-${index}`}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill="var(--accent-2)"
        fillOpacity={0.9}
        radius={2}
      />
      <text
        x={isRight ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isRight ? "end" : "start"}
        dominantBaseline="middle"
        fontSize={12}
        fill="var(--ink-2)"
      >
        {payload.name}
        <tspan fill="var(--muted)"> · {payload.value}</tspan>
      </text>
    </Layer>
  );
}

// Render links as filled ribbons (a thick *stroked* curve pinches inward at the
// bend; a filled area between two bezier edges stays clean).
function SankeyLink(props: any) {
  const {
    sourceX,
    sourceY,
    sourceControlX,
    targetControlX,
    targetX,
    targetY,
    linkWidth,
    index,
  } = props;
  const half = Math.max(linkWidth, 1) / 2;
  const d = [
    `M${sourceX},${sourceY - half}`,
    `C${sourceControlX},${sourceY - half} ${targetControlX},${targetY - half} ${targetX},${targetY - half}`,
    `L${targetX},${targetY + half}`,
    `C${targetControlX},${targetY + half} ${sourceControlX},${sourceY + half} ${sourceX},${sourceY + half}`,
    "Z",
  ].join(" ");
  return (
    <path
      key={`link-${index}`}
      d={d}
      fill="var(--accent)"
      fillOpacity={0.28}
      stroke="none"
    />
  );
}

// ---- data shaping -----------------------------------------------------------

interface Counts {
  notApplied: number;
  inProgress: number;
  applied: number;
  stages: Record<string, number>; // count per (custom) stage label, applied jobs
}

function counts(jobs: JobApplication[]): Counts {
  const applied = jobs.filter((j) => j.state === "Applied");
  const stages: Record<string, number> = {};
  for (const j of applied) {
    if (j.stage) stages[j.stage] = (stages[j.stage] ?? 0) + 1;
  }
  return {
    notApplied: jobs.filter((j) => j.state === "NotApplied").length,
    inProgress: jobs.filter((j) => j.state === "InProgress").length,
    applied: applied.length,
    stages,
  };
}

interface Slice {
  name: string;
  value: number;
  color: string;
}

function donutData(c: Counts): Slice[] {
  return [
    { name: "Not applied", value: c.notApplied, color: "#64748b" },
    { name: "In progress", value: c.inProgress, color: "#f59e0b" },
    { name: "Applied", value: c.applied, color: "#10b981" },
  ].filter((s) => s.value > 0);
}

function weekdayData(jobs: JobApplication[]) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const buckets = days.map((day) => ({ day, count: 0 }));
  for (const j of jobs) {
    if (!j.dateApplied) continue;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(j.dateApplied);
    const d = m
      ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      : new Date(j.dateApplied);
    if (!isNaN(d.getTime())) buckets[d.getDay()].count++;
  }
  return buckets;
}

function buildSankey(c: Counts) {
  // Only the outcomes of jobs actually applied to: a single "Applied" source
  // branching to each stage. Keeping every branch at the same column depth
  // avoids the cross-column ribbon overlap that ragged depths produce.
  const edges = (
    Object.entries(c.stages).map(
      ([label, count]): [string, string, number] => ["Applied", label, count],
    ) as [string, string, number][]
  ).filter(([, , v]) => v > 0);

  if (edges.length === 0) return null;

  const names: string[] = [];
  const idx = (n: string) => {
    let i = names.indexOf(n);
    if (i === -1) {
      names.push(n);
      i = names.length - 1;
    }
    return i;
  };
  const links = edges.map(([from, to, value]) => ({
    source: idx(from),
    target: idx(to),
    value,
  }));
  return { nodes: names.map((name) => ({ name })), links };
}

// ---- small presentational helpers -------------------------------------------

function Tile({
  tile,
  delay,
}: {
  tile: { label: string; value: number; accent: string };
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4"
    >
      <div className={`text-3xl font-semibold ${tile.accent}`}>{tile.value}</div>
      <div className="mt-1 text-xs text-slate-500">{tile.label}</div>
    </motion.div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4">
      <h3 className="mb-3 text-sm font-medium text-slate-300">{title}</h3>
      {children}
    </div>
  );
}

function Legend({ items }: { items: Slice[] }) {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs text-slate-400">
      {items.map((s) => (
        <span key={s.name} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
          {s.name} ({s.value})
        </span>
      ))}
    </div>
  );
}
