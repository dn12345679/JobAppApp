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
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: 8,
  color: "#e2e8f0",
  fontSize: 12,
};

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

  const tiles = [
    { label: "Total", value: jobs.length, accent: "text-slate-100" },
    { label: "Not applied", value: c.notApplied, accent: "text-slate-300" },
    { label: "In progress", value: c.inProgress, accent: "text-amber-300" },
    { label: "Applied", value: c.applied, accent: "text-emerald-300" },
    { label: "Interviews", value: c.interview, accent: "text-indigo-300" },
    { label: "In review", value: c.inReview, accent: "text-sky-300" },
    { label: "Accepted", value: c.accepted, accent: "text-emerald-400" },
    { label: "Rejected", value: c.rejected, accent: "text-rose-400" },
    { label: "Declined", value: c.declined, accent: "text-slate-400" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Count tiles */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {tiles.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4"
          >
            <div className={`text-3xl font-semibold ${s.accent}`}>{s.value}</div>
            <div className="mt-1 text-xs text-slate-500">{s.label}</div>
          </motion.div>
        ))}
      </div>

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
                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                    axisLine={{ stroke: "#334155" }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ fill: "#33415533" }}
                  />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card title="Application flow">
            {sankey ? (
              <ResponsiveContainer width="100%" height={280}>
                <Sankey
                  data={sankey}
                  nodePadding={24}
                  margin={{ left: 8, right: 120, top: 8, bottom: 8 }}
                  link={{ stroke: "#6366f1", strokeOpacity: 0.25 }}
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
        fill="#818cf8"
        fillOpacity={0.9}
        radius={2}
      />
      <text
        x={isRight ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isRight ? "end" : "start"}
        dominantBaseline="middle"
        fontSize={12}
        fill="#cbd5e1"
      >
        {payload.name}
        <tspan fill="#64748b"> · {payload.value}</tspan>
      </text>
    </Layer>
  );
}

// ---- data shaping -----------------------------------------------------------

interface Counts {
  notApplied: number;
  inProgress: number;
  applied: number;
  inReview: number;
  interview: number;
  rejected: number;
  accepted: number;
  declined: number;
}

function counts(jobs: JobApplication[]): Counts {
  const applied = jobs.filter((j) => j.state === "Applied");
  const byStage = (s: string) => applied.filter((j) => j.stage === s).length;
  return {
    notApplied: jobs.filter((j) => j.state === "NotApplied").length,
    inProgress: jobs.filter((j) => j.state === "InProgress").length,
    applied: applied.length,
    inReview: byStage("InReview"),
    interview: byStage("Interview"),
    rejected: byStage("Rejected"),
    accepted: byStage("Accepted"),
    declined: byStage("Declined"),
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
  const edges = (
    [
      ["Applications", "Not applied", c.notApplied],
      ["Applications", "In progress", c.inProgress],
      ["Applications", "Applied", c.applied],
      ["Applied", "In review", c.inReview],
      ["Applied", "Interview", c.interview],
      ["Applied", "Rejected", c.rejected],
      ["Applied", "Accepted", c.accepted],
      ["Applied", "Declined", c.declined],
    ] as [string, string, number][]
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
