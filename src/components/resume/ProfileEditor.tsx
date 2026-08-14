import { useState } from "react";
import type {
  EducationEntry,
  ExperienceEntry,
  ProjectEntry,
  ResumeProfile,
  SectionKey,
  SkillGroup,
} from "../../types";

// Left-pane structured editor. Edits the whole ResumeProfile immutably and hands
// each change up via onChange; the parent debounces the DB write. See DESIGN.md
// §11.
//
// The editable sections mirror the résumé's `sectionOrder`, so reordering here
// reorders the résumé. Contact is the fixed header and isn't part of the order.
// Collapsing a section is local view state (to focus on others) and isn't saved.

const uuid = () => crypto.randomUUID();
const setAt = <T,>(arr: T[], i: number, v: T): T[] =>
  arr.map((x, idx) => (idx === i ? v : x));
const removeAt = <T,>(arr: T[], i: number): T[] =>
  arr.filter((_, idx) => idx !== i);
const moveInArray = <T,>(arr: T[], i: number, dir: -1 | 1): T[] => {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

const DEFAULT_ORDER: SectionKey[] = [
  "summary",
  "experience",
  "education",
  "projects",
  "skills",
];

// Resilient to a stored order that's missing/extra keys: keep known keys in
// their saved order, then append any that are absent.
function normalizeOrder(o?: SectionKey[]): SectionKey[] {
  const kept = (o ?? []).filter((k) => DEFAULT_ORDER.includes(k));
  for (const k of DEFAULT_ORDER) if (!kept.includes(k)) kept.push(k);
  return kept;
}

const newExperience = (): ExperienceEntry => ({
  id: uuid(),
  company: "",
  role: "",
  location: "",
  startDate: "",
  endDate: "",
  bullets: [""],
});
const newEducation = (): EducationEntry => ({
  id: uuid(),
  school: "",
  degree: "",
  location: "",
  startDate: "",
  endDate: "",
  gpa: "",
  details: [""],
});
const newProject = (): ProjectEntry => ({
  id: uuid(),
  name: "",
  link: "",
  tech: "",
  startDate: "",
  endDate: "",
  bullets: [""],
});
const newSkillGroup = (): SkillGroup => ({ id: uuid(), label: "", items: [] });

type SavedState = "idle" | "saving" | "saved";

export default function ProfileEditor({
  profile,
  onChange,
  savedAt,
}: {
  profile: ResumeProfile;
  onChange: (p: ResumeProfile) => void;
  savedAt: SavedState;
}) {
  const { contact } = profile;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (k: string) =>
    setCollapsed((c) => ({ ...c, [k]: !c[k] }));

  const patchContact = (c: Partial<typeof contact>) =>
    onChange({ ...profile, contact: { ...contact, ...c } });

  const order = normalizeOrder(profile.settings.sectionOrder);
  const move = (key: SectionKey, dir: -1 | 1) => {
    const i = order.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...profile, settings: { ...profile.settings, sectionOrder: next } });
  };

  // Hidden entries stay in the editor (content preserved) but are excluded from
  // the résumé/PDF — settings.hidden maps entryId → true, which the preview reads.
  const hidden = profile.settings.hidden ?? {};
  const toggleHide = (id: string) =>
    onChange({
      ...profile,
      settings: { ...profile.settings, hidden: { ...hidden, [id]: !hidden[id] } },
    });

  // The reorder + hide props for one entry within its list.
  const entryControls = <T extends { id: string }>(
    list: T[],
    i: number,
    apply: (next: T[]) => void,
  ) => ({
    onMoveUp: () => apply(moveInArray(list, i, -1)),
    onMoveDown: () => apply(moveInArray(list, i, 1)),
    canUp: i > 0,
    canDown: i < list.length - 1,
    hidden: !!hidden[list[i].id],
    onToggleHide: () => toggleHide(list[i].id),
  });

  const sections: Record<
    SectionKey,
    { title: string; onAdd?: () => void; body: React.ReactNode }
  > = {
    summary: {
      title: "Summary",
      body: (
        <TextArea
          label="Summary"
          value={contact.summary ?? ""}
          onChange={(v) => patchContact({ summary: v })}
          placeholder="A one- or two-line headline."
        />
      ),
    },
    experience: {
      title: "Experience",
      onAdd: () =>
        onChange({ ...profile, experience: [...profile.experience, newExperience()] }),
      body: profile.experience.map((e, i) => {
        const set = (v: ExperienceEntry) =>
          onChange({ ...profile, experience: setAt(profile.experience, i, v) });
        return (
          <EntryCard
            key={e.id}
            onRemove={() =>
              onChange({ ...profile, experience: removeAt(profile.experience, i) })
            }
            {...entryControls(profile.experience, i, (next) =>
              onChange({ ...profile, experience: next }),
            )}
          >
            <div className="grid grid-cols-2 gap-2">
              <Field label="Role" value={e.role} onChange={(v) => set({ ...e, role: v })} />
              <Field
                label="Company"
                value={e.company}
                onChange={(v) => set({ ...e, company: v })}
              />
            </div>
            <Field
              label="Location"
              value={e.location ?? ""}
              onChange={(v) => set({ ...e, location: v })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Start"
                value={e.startDate ?? ""}
                onChange={(v) => set({ ...e, startDate: v })}
                placeholder="Jan 2023"
              />
              <Field
                label="End"
                value={e.endDate ?? ""}
                onChange={(v) => set({ ...e, endDate: v })}
                placeholder="Present"
              />
            </div>
            <Bullets
              label="Bullets"
              items={e.bullets}
              onChange={(b) => set({ ...e, bullets: b })}
            />
          </EntryCard>
        );
      }),
    },
    education: {
      title: "Education",
      onAdd: () =>
        onChange({ ...profile, education: [...profile.education, newEducation()] }),
      body: profile.education.map((e, i) => {
        const set = (v: EducationEntry) =>
          onChange({ ...profile, education: setAt(profile.education, i, v) });
        return (
          <EntryCard
            key={e.id}
            onRemove={() =>
              onChange({ ...profile, education: removeAt(profile.education, i) })
            }
            {...entryControls(profile.education, i, (next) =>
              onChange({ ...profile, education: next }),
            )}
          >
            <Field label="School" value={e.school} onChange={(v) => set({ ...e, school: v })} />
            <Field
              label="Degree"
              value={e.degree ?? ""}
              onChange={(v) => set({ ...e, degree: v })}
              placeholder="B.S. Computer Science"
            />
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Start"
                value={e.startDate ?? ""}
                onChange={(v) => set({ ...e, startDate: v })}
              />
              <Field
                label="End"
                value={e.endDate ?? ""}
                onChange={(v) => set({ ...e, endDate: v })}
              />
            </div>
            <Field
              label="GPA"
              value={e.gpa ?? ""}
              onChange={(v) => set({ ...e, gpa: v })}
              placeholder="3.8"
            />
            <Bullets
              label="Details"
              items={e.details}
              onChange={(d) => set({ ...e, details: d })}
            />
          </EntryCard>
        );
      }),
    },
    projects: {
      title: "Projects",
      onAdd: () =>
        onChange({ ...profile, projects: [...profile.projects, newProject()] }),
      body: profile.projects.map((p, i) => {
        const set = (v: ProjectEntry) =>
          onChange({ ...profile, projects: setAt(profile.projects, i, v) });
        return (
          <EntryCard
            key={p.id}
            onRemove={() =>
              onChange({ ...profile, projects: removeAt(profile.projects, i) })
            }
            {...entryControls(profile.projects, i, (next) =>
              onChange({ ...profile, projects: next }),
            )}
          >
            <Field label="Name" value={p.name} onChange={(v) => set({ ...p, name: v })} />
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Tech"
                value={p.tech ?? ""}
                onChange={(v) => set({ ...p, tech: v })}
                placeholder="React, Rust"
              />
              <Field
                label="Link"
                value={p.link ?? ""}
                onChange={(v) => set({ ...p, link: v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Start"
                value={p.startDate ?? ""}
                onChange={(v) => set({ ...p, startDate: v })}
                placeholder="June 2025"
              />
              <Field
                label="End"
                value={p.endDate ?? ""}
                onChange={(v) => set({ ...p, endDate: v })}
                placeholder="Aug 2025"
              />
            </div>
            <Bullets
              label="Bullets"
              items={p.bullets}
              onChange={(b) => set({ ...p, bullets: b })}
            />
          </EntryCard>
        );
      }),
    },
    skills: {
      title: "Skills",
      onAdd: () =>
        onChange({ ...profile, skills: [...profile.skills, newSkillGroup()] }),
      body: profile.skills.map((g, i) => {
        const set = (v: SkillGroup) =>
          onChange({ ...profile, skills: setAt(profile.skills, i, v) });
        return (
          <EntryCard
            key={g.id}
            onRemove={() =>
              onChange({ ...profile, skills: removeAt(profile.skills, i) })
            }
            {...entryControls(profile.skills, i, (next) =>
              onChange({ ...profile, skills: next }),
            )}
          >
            <Field
              label="Category"
              value={g.label}
              onChange={(v) => set({ ...g, label: v })}
              placeholder="Languages"
            />
            <SkillItems items={g.items} onChange={(items) => set({ ...g, items })} />
          </EntryCard>
        );
      }),
    },
  };

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-400">Profile</h2>
        <span className="text-xs text-slate-500">
          {savedAt === "saving" ? "Saving…" : savedAt === "saved" ? "Saved" : ""}
        </span>
      </div>

      {/* Contact — fixed header, not part of the résumé section order */}
      <Group
        title="Contact"
        collapsed={!!collapsed.contact}
        onToggle={() => toggle("contact")}
      >
        <Field
          label="Full name"
          value={contact.fullName}
          onChange={(v) => patchContact({ fullName: v })}
          placeholder="Jane Doe"
        />
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="Email"
            value={contact.email ?? ""}
            onChange={(v) => patchContact({ email: v })}
            placeholder="jane@example.com"
          />
          <Field
            label="Phone"
            value={contact.phone ?? ""}
            onChange={(v) => patchContact({ phone: v })}
            placeholder="(555) 555-5555"
          />
        </div>
        <Field
          label="Location"
          value={contact.location ?? ""}
          onChange={(v) => patchContact({ location: v })}
          placeholder="City, ST"
        />
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="Website"
            value={contact.website ?? ""}
            onChange={(v) => patchContact({ website: v })}
          />
          <Field
            label="LinkedIn"
            value={contact.linkedin ?? ""}
            onChange={(v) => patchContact({ linkedin: v })}
          />
        </div>
        <Field
          label="GitHub"
          value={contact.github ?? ""}
          onChange={(v) => patchContact({ github: v })}
        />
      </Group>

      {/* Résumé sections, in (and controlling) the résumé's order */}
      {order.map((key, idx) => {
        const s = sections[key];
        return (
          <Group
            key={key}
            title={s.title}
            collapsed={!!collapsed[key]}
            onToggle={() => toggle(key)}
            onAdd={s.onAdd}
            reorder={{
              onUp: () => move(key, -1),
              onDown: () => move(key, 1),
              canUp: idx > 0,
              canDown: idx < order.length - 1,
            }}
          >
            {s.body}
          </Group>
        );
      })}
    </div>
  );
}

// ---- building blocks --------------------------------------------------------

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500";

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} resize-y`}
      />
    </label>
  );
}

type Reorder = {
  onUp: () => void;
  onDown: () => void;
  canUp: boolean;
  canDown: boolean;
};

function Group({
  title,
  collapsed,
  onToggle,
  onAdd,
  reorder,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  reorder?: Reorder;
  children: React.ReactNode;
}) {
  const moveBtn =
    "rounded px-1 text-xs text-slate-500 enabled:hover:text-slate-200 disabled:opacity-25";
  return (
    <div className="mb-3 rounded-lg border border-slate-800">
      <div className="flex items-center justify-between gap-1 px-2 py-1.5">
        <button
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200"
        >
          <span
            className="inline-block transition-transform"
            style={{ transform: collapsed ? "rotate(0deg)" : "rotate(90deg)" }}
          >
            ▶
          </span>
          <span className="truncate">{title}</span>
        </button>
        <div className="flex items-center gap-0.5">
          {reorder && (
            <>
              <button
                onClick={reorder.onUp}
                disabled={!reorder.canUp}
                title="Move up"
                className={moveBtn}
              >
                ↑
              </button>
              <button
                onClick={reorder.onDown}
                disabled={!reorder.canDown}
                title="Move down"
                className={moveBtn}
              >
                ↓
              </button>
            </>
          )}
          {onAdd && (
            <button
              onClick={onAdd}
              className="ml-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100"
            >
              ＋ Add
            </button>
          )}
        </div>
      </div>
      {!collapsed && <div className="space-y-2.5 px-3 pb-3">{children}</div>}
    </div>
  );
}

function EntryCard({
  onRemove,
  onMoveUp,
  onMoveDown,
  canUp,
  canDown,
  hidden,
  onToggleHide,
  children,
}: {
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canUp?: boolean;
  canDown?: boolean;
  hidden?: boolean;
  onToggleHide?: () => void;
  children: React.ReactNode;
}) {
  const iconBtn =
    "rounded px-1 text-xs text-slate-500 enabled:hover:text-slate-200 disabled:opacity-25";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="mb-1.5 flex items-center gap-0.5">
        {onMoveUp && (
          <button
            onClick={onMoveUp}
            disabled={!canUp}
            title="Move up"
            className={iconBtn}
          >
            ↑
          </button>
        )}
        {onMoveDown && (
          <button
            onClick={onMoveDown}
            disabled={!canDown}
            title="Move down"
            className={iconBtn}
          >
            ↓
          </button>
        )}
        {hidden && (
          <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
            Hidden from résumé
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {onToggleHide && (
            <button
              onClick={onToggleHide}
              title={hidden ? "Show on résumé" : "Hide from résumé (keeps content)"}
              className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400 hover:border-slate-600 hover:text-slate-200"
            >
              {hidden ? "Show" : "Hide"}
            </button>
          )}
          <button
            onClick={onRemove}
            title="Delete"
            className="text-slate-600 hover:text-rose-400"
          >
            ✕
          </button>
        </div>
      </div>
      <div className={`space-y-2 ${hidden ? "opacity-40" : ""}`}>{children}</div>
    </div>
  );
}

function Bullets({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <div className="space-y-1.5">
        {items.map((b, i) => (
          <div key={i} className="flex items-start gap-1">
            <div className="flex flex-col pt-0.5 text-xs leading-none text-slate-500">
              <button
                onClick={() => onChange(moveInArray(items, i, -1))}
                disabled={i === 0}
                title="Move up"
                className="px-0.5 enabled:hover:text-slate-200 disabled:opacity-25"
              >
                ↑
              </button>
              <button
                onClick={() => onChange(moveInArray(items, i, 1))}
                disabled={i === items.length - 1}
                title="Move down"
                className="px-0.5 enabled:hover:text-slate-200 disabled:opacity-25"
              >
                ↓
              </button>
            </div>
            <textarea
              value={b}
              rows={1}
              onChange={(e) => onChange(setAt(items, i, e.target.value))}
              className={`${inputCls} resize-y`}
            />
            <button
              onClick={() => onChange(removeAt(items, i))}
              title="Remove bullet"
              className="shrink-0 px-1 text-slate-600 hover:text-rose-400"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...items, ""])}
          className="text-xs text-indigo-400 hover:text-indigo-300"
        >
          ＋ bullet
        </button>
      </div>
    </div>
  );
}

// Skills are stored as string[] but edited as a comma-separated line. Local
// state keeps typing smooth (no split/join round-trip fighting the cursor).
function SkillItems({
  items,
  onChange,
}: {
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [text, setText] = useState(() => items.join(", "));
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">
        Skills (comma-separated)
      </span>
      <input
        value={text}
        placeholder="TypeScript, Rust, SQL"
        onChange={(e) => {
          setText(e.target.value);
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          );
        }}
        className={inputCls}
      />
    </label>
  );
}
