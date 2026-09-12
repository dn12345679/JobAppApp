import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  BulletStyle,
  EducationEntry,
  ExperienceEntry,
  ProjectEntry,
  ResumeProfile,
  ResumeTemplate,
  SectionKey,
  SkillGroup,
} from "../../types";
import TemplateGallery from "./TemplateGallery";

const TEMPLATE_LABEL: Record<ResumeTemplate, string> = {
  classic: "Classic",
  jake: "JG",
  twocol: "Two-column",
};

// True Letter dimensions at 96dpi (see DESIGN.md §11.5). The sheet renders at
// this size and is visually scaled by `zoom`; the one-page fit meter measures
// the *unscaled* content height, which CSS transforms don't affect.
export const PAGE_W = 816;
export const PAGE_H = 1056;
const PAGE_PAD = 48;

// Print-neutral palette — fixed colors so the résumé looks the same regardless
// of the app theme (and matches what a PDF export will produce).
const INK = "#111827";
const BODY = "#1f2937";
const MUTED = "#6b7280";
const RULE = "#d1d5db";

const DEFAULT_ORDER: SectionKey[] = [
  "summary",
  "experience",
  "education",
  "projects",
  "skills",
];

// Every template is one consistent HTML/CSS rendering over the same structured
// profile so the preview and the (print) PDF are always identical.
const TEMPLATES: Record<ResumeTemplate, { font: string; base: number }> = {
  classic: { 
    font: 'Georgia, "Times New Roman", serif', 
    base: 13 },
  jake: {
    font: '"Latin Modern Roman", "Charter", Georgia, "Times New Roman", serif',
    base: 13,
  },
  twocol: { 
    font: '"Helvetica Neue", Arial, system-ui, sans-serif', 
    base: 12 
  },
};

// Native list markers for dot/hollow; dash is drawn manually (below) for a
// predictable hanging indent.
const BULLET_CSS: Record<BulletStyle, string> = {
  disc: "disc",
  circle: "circle",
  dash: "none",
};

const clampZoom = (z: number) =>
  Math.min(1.5, Math.max(0.4, Math.round(z * 10) / 10));

const dateRange = (a: string | null, b: string | null) =>
  [a, b].map((s) => (s ?? "").trim()).filter(Boolean).join(" – ");

type BodyProps = {
  contact: ResumeProfile["contact"];
  order: SectionKey[];
  base: number;
  bullet: BulletStyle;
  sectionGap: number; // px added to the gap after each section (Edit ▸ spacing)
  bulletGap: number; // px added to the gap after each bullet (Edit ▸ spacing)
  experience: ExperienceEntry[];
  education: EducationEntry[];
  projects: ProjectEntry[];
  skills: SkillGroup[];
};

export default function ResumePreview({
  profile,
  onChange,
}: {
  profile: ResumeProfile;
  onChange: (p: ResumeProfile) => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetH, setSheetH] = useState(PAGE_H);
  const [zoom, setZoom] = useState(1.0);
  const [gallery, setGallery] = useState(false);

  // Measure the natural (unscaled) content height for the fit meter. Re-runs on
  // any profile change (content or template).
  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const measure = () => setSheetH(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [profile]);

  const pages = sheetH / PAGE_H;
  // Headroom so cross-platform font-metric differences don't flip a one-page
  // sheet into a warning — Georgia (desktop) vs Android's serif fallback measure
  // slightly differently. Anything clearly over one page still warns.
  const fits = pages <= 1.08;

  const setTemplate = (template: ResumeTemplate) =>
    onChange({ ...profile, settings: { ...profile.settings, template } });
  const setBullet = (bulletStyle: BulletStyle) =>
    onChange({ ...profile, settings: { ...profile.settings, bulletStyle } });

  return (
    <section className="flex flex-1 flex-col overflow-hidden bg-slate-900/40">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-2.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            fits
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-amber-500/20 text-amber-300"
          }`}
          title="Estimated printed length"
        >
          {fits ? "1 page" : `${pages.toFixed(2)} pages · trim to fit`}
        </span>

        <button
          onClick={() => setGallery(true)}
          title="Choose a template"
          className="ml-1 inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100"
        >
          <span className="text-slate-500">Template:</span>
          <span>{TEMPLATE_LABEL[profile.settings.template] ?? "Classic"}</span>
          <span aria-hidden>▦</span>
        </button>

        <label className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">Bullets</span>
          <select
            value={profile.settings.bulletStyle ?? "disc"}
            onChange={(e) => setBullet(e.target.value as BulletStyle)}
            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 outline-none focus:border-indigo-500"
          >
            <option value="disc">● Dot</option>
            <option value="circle">○ Hollow</option>
            <option value="dash">– Dash</option>
          </select>
        </label>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setZoom((z) => clampZoom(z - 0.1))}
            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-300 hover:border-slate-600 hover:text-slate-100"
            title="Zoom out"
          >
            −
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-slate-400">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => clampZoom(z + 0.1))}
            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-300 hover:border-slate-600 hover:text-slate-100"
            title="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => setZoom(1)}
            className="ml-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100"
            title="Reset to 100%"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Scaled page. The spacer sizes to the scaled footprint so scrolling and
          centering behave (CSS transforms don't affect layout size). */}
      <div className="flex-1 overflow-auto p-6">
        <div
          style={{ width: PAGE_W * zoom, height: sheetH * zoom, margin: "0 auto" }}
        >
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}>
            <Sheet ref={sheetRef} profile={profile} />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {gallery && (
          <TemplateGallery
            current={profile.settings.template}
            onSelect={(t) => {
              setTemplate(t);
              setGallery(false);
            }}
            onClose={() => setGallery(false)}
          />
        )}
      </AnimatePresence>

      {/* Print/PDF copy: an unscaled sheet in a body-level portal. Hidden on
          screen; the print stylesheet (index.css) shows only this. */}
      {createPortal(
        <div id="resume-print">
          <Sheet profile={profile} bare />
        </div>,
        document.body,
      )}
    </section>
  );
}

export const Sheet = ({
  ref,
  profile,
  bare,
}: {
  ref?: React.Ref<HTMLDivElement>;
  profile: ResumeProfile;
  bare?: boolean; // no drop shadow — used for the print/PDF copy
}) => {
  const { contact, settings } = profile;
  const hidden = settings.hidden ?? {};
  const order = settings.sectionOrder?.length ? settings.sectionOrder : DEFAULT_ORDER;
  const tpl = TEMPLATES[settings.template] ?? TEMPLATES.classic;
  const base = tpl.base * (settings.fontScale || 1);
  // Spacing deltas from the Edit menu, clamped so a section/bullet never collapses
  // into the next or pushes absurdly far apart.
  const sectionGap = Math.max(-6, Math.min(24, settings.sectionSpacing || 0));
  const bulletGap = Math.max(-1, Math.min(10, settings.bulletSpacing || 0));

  const experience = profile.experience.filter((e) => !hidden[e.id]);
  const education = profile.education.filter((e) => !hidden[e.id]);
  const projects = profile.projects.filter((e) => !hidden[e.id]);
  const skills = profile.skills.filter((e) => !hidden[e.id]);

  const empty =
    !contact.fullName.trim() &&
    !contact.summary?.trim() &&
    experience.length === 0 &&
    education.length === 0 &&
    projects.length === 0 &&
    skills.length === 0;

  const body: BodyProps = {
    contact,
    order,
    base,
    bullet: settings.bulletStyle ?? "disc",
    sectionGap,
    bulletGap,
    experience,
    education,
    projects,
    skills,
  };

  return (
    <div
      ref={ref}
      style={{
        width: PAGE_W,
        minHeight: PAGE_H,
        padding: PAGE_PAD,
        background: "#fff",
        color: BODY,
        fontFamily: tpl.font,
        fontSize: base,
        lineHeight: 1.42,
        boxShadow: bare ? "none" : "0 1px 8px rgba(0,0,0,0.35)",
      }}
    >
      {empty ? (
        <div
          style={{
            color: "#9ca3af",
            textAlign: "center",
            marginTop: 220,
            fontFamily: "system-ui, sans-serif",
            fontSize: 14,
          }}
        >
          Add your details on the left to build your résumé.
        </div>
      ) : settings.template === "jake" ? (
        <JakeBody {...body} />
      ) : settings.template === "twocol" ? (
        <TwoColumnBody {...body} />
      ) : (
        <ClassicBody {...body} />
      )}
    </div>
  );
};

// ---- shared helpers ---------------------------------------------------------

function TitleRow({
  left,
  right,
  color = MUTED,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: INK }}>{left}</span>
      {right ? <span style={{ color, whiteSpace: "nowrap" }}>{right}</span> : null}
    </div>
  );
}

const bulletList = (
  items: string[],
  base: number,
  bullet: BulletStyle,
  gap = 0,
) => {
  const visible = items.map((b) => b.trim()).filter(Boolean);
  if (!visible.length) return null;
  const dash = bullet === "dash";
  const mb = Math.max(0, 1.5 + gap);
  return (
    <ul
      style={{
        margin: "3px 0 0",
        paddingLeft: dash ? 2 : 16,
        fontSize: base * 0.97,
        listStyleType: BULLET_CSS[bullet],
      }}
    >
      {visible.map((b, i) => (
        <li
          key={i}
          style={
            dash
              ? { marginBottom: mb, paddingLeft: 14, textIndent: -14 }
              : { marginBottom: mb }
          }
        >
          {dash ? "–  " : null}
          {b}
        </li>
      ))}
    </ul>
  );
};

type ContactItem = { kind: "email" | "url" | "text"; value: string };

// Contact values tagged with their link type. `includeLocation` because some
// templates keep location out of the header.
function contactItems(
  contact: ResumeProfile["contact"],
  includeLocation: boolean,
): ContactItem[] {
  const items: ContactItem[] = [
    { kind: "email", value: contact.email ?? "" },
    { kind: "text", value: contact.phone ?? "" },
    ...(includeLocation
      ? [{ kind: "text" as const, value: contact.location ?? "" }]
      : []),
    { kind: "url", value: contact.website ?? "" },
    { kind: "url", value: contact.linkedin ?? "" },
    { kind: "url", value: contact.github ?? "" },
  ];
  return items
    .map((it) => ({ ...it, value: it.value.trim() }))
    .filter((it) => it.value);
}

const hrefFor = (it: ContactItem) =>
  it.kind === "email"
    ? `mailto:${it.value}`
    : /^https?:\/\//i.test(it.value)
      ? it.value
      : `https://${it.value}`;

// A real <a> so the exported PDF carries clickable link annotations. On screen a
// click opens the system browser (via the opener plugin) rather than navigating
// the app's own webview away.
function ContactLink({
  item,
  underline,
}: {
  item: ContactItem;
  underline?: boolean;
}) {
  if (item.kind === "text") return <span>{item.value}</span>;
  const href = hrefFor(item);
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        void openUrl(href);
      }}
      style={{
        color: "inherit",
        textDecoration: underline ? "underline" : "none",
      }}
    >
      {item.value}
    </a>
  );
}

// ---- Classic template -------------------------------------------------------

function ClassicBody({
  contact,
  order,
  base,
  bullet,
  sectionGap,
  bulletGap,
  experience,
  education,
  projects,
  skills,
}: BodyProps) {
  const indent = base * 1.1;
  const items = contactItems(contact, true);

  const Section = ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <section style={{ marginBottom: 14 + sectionGap }}>
      <h2
        style={{
          fontSize: base * 0.82,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          fontWeight: 700,
          color: INK,
          paddingBottom: 2,
          marginBottom: 6,
        }}
      >
        {title}
      </h2>
      <div style={{ paddingLeft: indent }}>{children}</div>
    </section>
  );

  return (
    <>
      <header style={{ textAlign: "center", marginBottom: 14 }}>
        <div style={{ fontSize: base * 1.9, fontWeight: 700, color: INK }}>
          {contact.fullName || "Your Name"}
        </div>
        {items.length > 0 && (
          <div style={{ color: MUTED, fontSize: base * 0.9, marginTop: 3 }}>
            {items.map((it, i) => (
              <span key={i}>
                {i > 0 && "  ·  "}
                <ContactLink item={it} />
              </span>
            ))}
          </div>
        )}
      </header>

      {order.map((key) => {
        if (key === "summary")
          return contact.summary?.trim() ? (
            <Section key={key} title="Summary">
              <p style={{ margin: 0 }}>{contact.summary}</p>
            </Section>
          ) : null;
        if (key === "experience")
          return experience.length ? (
            <Section key={key} title="Experience">
              {experience.map((e) => (
                <div key={e.id} style={{ marginBottom: 9 }}>
                  <TitleRow
                    left={
                      <>
                        <b>{e.role || "Role"}</b>
                        {e.company ? ` · ${e.company}` : ""}
                      </>
                    }
                    right={dateRange(e.startDate, e.endDate)}
                  />
                  {e.location?.trim() && (
                    <div style={{ color: MUTED, fontStyle: "italic" }}>
                      {e.location}
                    </div>
                  )}
                  {bulletList(e.bullets, base, bullet, bulletGap)}
                </div>
              ))}
            </Section>
          ) : null;
        if (key === "education")
          return education.length ? (
            <Section key={key} title="Education">
              {education.map((e) => (
                <div key={e.id} style={{ marginBottom: 9 }}>
                  <TitleRow
                    left={<b>{e.school || "School"}</b>}
                    right={dateRange(e.startDate, e.endDate)}
                  />
                  {(e.degree?.trim() || e.gpa?.trim()) && (
                    <div>
                      {e.degree}
                      {e.degree && e.gpa ? " · " : ""}
                      {e.gpa ? `GPA ${e.gpa}` : ""}
                    </div>
                  )}
                  {bulletList(e.details, base, bullet, bulletGap)}
                </div>
              ))}
            </Section>
          ) : null;
        if (key === "projects")
          return projects.length ? (
            <Section key={key} title="Projects">
              {projects.map((p) => (
                <div key={p.id} style={{ marginBottom: 9 }}>
                  <TitleRow
                    left={
                      <>
                        <b>{p.name || "Project"}</b>
                        {p.tech ? ` · ${p.tech}` : ""}
                      </>
                    }
                    right={dateRange(p.startDate, p.endDate)}
                  />
                  {bulletList(p.bullets, base, bullet, bulletGap)}
                </div>
              ))}
            </Section>
          ) : null;
        if (key === "skills")
          return skills.length ? (
            <Section key={key} title="Skills">
              {skills.map((g) => {
                const items = g.items.map((s) => s.trim()).filter(Boolean);
                if (!g.label.trim() && !items.length) return null;
                return (
                  <div key={g.id} style={{ marginBottom: 3 }}>
                    {g.label && <b style={{ color: INK }}>{g.label}: </b>}
                    {items.join(", ")}
                  </div>
                );
              })}
            </Section>
          ) : null;
        return null;
      })}
    </>
  );
}

// ---- Two-column template ----------------------------------------------------
// Example of a structurally different layout: a CSS grid with a left sidebar.
// Sections are assigned to a column, but the user's reorder is still honored
// *within* each column. Reuses the same shared helpers (INK/MUTED/RULE colors,
// bulletList, dateRange) — the layout is entirely in this JSX/CSS.

function TwoColumnBody({
  contact,
  order,
  base,
  bullet,
  sectionGap,
  bulletGap,
  experience,
  education,
  projects,
  skills,
}: BodyProps) {
  const sMb = 12 + sectionGap; // shared section gap for this template
  const heading = (t: string) => (
    <div
      style={{
        fontSize: base * 0.8,
        textTransform: "uppercase",
        letterSpacing: 1.2,
        fontWeight: 700,
        color: INK,
        borderBottom: `1px solid ${RULE}`,
        paddingBottom: 2,
        marginBottom: 6,
      }}
    >
      {t}
    </div>
  );

  const contactRows = contactItems(contact, true);

  const renderSection = (key: SectionKey) => {
    if (key === "summary")
      return contact.summary?.trim() ? (
        <section key={key} style={{ marginBottom: sMb }}>
          {heading("Summary")}
          <p style={{ margin: 0 }}>{contact.summary}</p>
        </section>
      ) : null;

    if (key === "experience")
      return experience.length ? (
        <section key={key} style={{ marginBottom: sMb }}>
          {heading("Experience")}
          {experience.map((e) => (
            <div key={e.id} style={{ marginBottom: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: INK }}>
                  <b>{e.role || "Role"}</b>
                  {e.company ? ` · ${e.company}` : ""}
                </span>
                <span style={{ color: MUTED, whiteSpace: "nowrap" }}>
                  {dateRange(e.startDate, e.endDate)}
                </span>
              </div>
              {e.location?.trim() && (
                <div style={{ color: MUTED, fontStyle: "italic" }}>{e.location}</div>
              )}
              {bulletList(e.bullets, base, bullet, bulletGap)}
            </div>
          ))}
        </section>
      ) : null;

    if (key === "projects")
      return projects.length ? (
        <section key={key} style={{ marginBottom: sMb }}>
          {heading("Projects")}
          {projects.map((p) => (
            <div key={p.id} style={{ marginBottom: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: INK }}>
                  <b>{p.name || "Project"}</b>
                  {p.tech ? ` · ${p.tech}` : ""}
                </span>
                <span style={{ color: MUTED, whiteSpace: "nowrap" }}>
                  {dateRange(p.startDate, p.endDate)}
                </span>
              </div>
              {bulletList(p.bullets, base, bullet, bulletGap)}
            </div>
          ))}
        </section>
      ) : null;

    if (key === "education")
      return education.length ? (
        <section key={key} style={{ marginBottom: sMb }}>
          {heading("Education")}
          {education.map((e) => (
            <div key={e.id} style={{ marginBottom: 8 }}>
              <div style={{ color: INK }}>
                <b>{e.school || "School"}</b>
              </div>
              {e.degree?.trim() && <div>{e.degree}</div>}
              {e.gpa?.trim() && <div style={{ color: MUTED }}>GPA {e.gpa}</div>}
              <div style={{ color: MUTED }}>{dateRange(e.startDate, e.endDate)}</div>
            </div>
          ))}
        </section>
      ) : null;

    if (key === "skills")
      return skills.length ? (
        <section key={key} style={{ marginBottom: sMb }}>
          {heading("Skills")}
          {skills.map((g) => {
            const items = g.items.map((s) => s.trim()).filter(Boolean);
            if (!g.label.trim() && !items.length) return null;
            return (
              <div key={g.id} style={{ marginBottom: 5 }}>
                {g.label && (
                  <div style={{ color: INK, fontWeight: 700 }}>{g.label}</div>
                )}
                <div>{items.join(", ")}</div>
              </div>
            );
          })}
        </section>
      ) : null;

    return null;
  };

  // Which sections live in which column; each column renders in the user's order.
  const SIDEBAR: SectionKey[] = ["skills", "education"];
  const MAIN: SectionKey[] = ["summary", "experience", "projects"];
  const sidebar = order.filter((k) => SIDEBAR.includes(k));
  const main = order.filter((k) => MAIN.includes(k));

  return (
    <div>
      <header style={{ marginBottom: 12 }}>
        <div
          style={{ fontSize: base * 2.1, fontWeight: 700, color: INK, letterSpacing: 0.5 }}
        >
          {contact.fullName || "Your Name"}
        </div>
        <div style={{ height: 2, background: INK, marginTop: 4 }} />
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "32% 1fr", gap: 0 }}>
        <aside style={{ paddingRight: 18, borderRight: `1px solid ${RULE}` }}>
          {contactRows.length > 0 && (
            <section style={{ marginBottom: 12 }}>
              {heading("Contact")}
              {contactRows.map((c, i) => (
                <div key={i} style={{ marginBottom: 2, wordBreak: "break-word" }}>
                  <ContactLink item={c} />
                </div>
              ))}
            </section>
          )}
          {sidebar.map(renderSection)}
        </aside>
        <main style={{ paddingLeft: 18 }}>{main.map(renderSection)}</main>
      </div>
    </div>
  );
}

// ---- LaTeX "Jake" template --------------------------------------------------
// A faithful HTML recreation of the classic Jake Gutierrez résumé: small-caps
// name + section heads, full-width rules, two-line subheadings (bold title +
// right date; italic org + right location).

function JakeBody({
  contact,
  order,
  base,
  bullet,
  sectionGap,
  bulletGap,
  experience,
  education,
  projects,
  skills,
}: BodyProps) {
  const indent = base * 1.1;
  const pieces = contactItems(contact, false);

  const Section = ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <section style={{ marginBottom: 8 + sectionGap }}>
      <div
        style={{
          fontVariant: "small-caps",
          fontSize: base * 1.12,
          letterSpacing: 0.5,
          color: INK,
          borderBottom: `1px solid ${INK}`,
          paddingBottom: 1,
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      <div style={{ paddingLeft: indent }}>{children}</div>
    </section>
  );

  const SubLine = ({
    left,
    right,
    italic,
  }: {
    left: React.ReactNode;
    right: React.ReactNode;
    italic?: boolean;
  }) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontStyle: italic ? "italic" : "normal",
        fontSize: italic ? base * 0.95 : base,
      }}
    >
      <span style={{ color: italic ? BODY : INK }}>{left}</span>
      {right ? <span style={{ whiteSpace: "nowrap" }}>{right}</span> : null}
    </div>
  );

  return (
    <>
      <header style={{ textAlign: "center", marginBottom: 10 }}>
        <div
          style={{
            fontSize: base * 2.4,
            fontWeight: 700,
            fontVariant: "small-caps",
            letterSpacing: 1,
            color: INK,
            lineHeight: 1.05,
          }}
        >
          {contact.fullName || "Your Name"}
        </div>
        {pieces.length > 0 && (
          <div style={{ fontSize: base * 0.92, marginTop: 4, color: BODY }}>
            {pieces.map((p, i) => (
              <span key={i}>
                {i > 0 && <span style={{ color: MUTED }}> {" | "} </span>}
                <ContactLink item={p} underline={p.kind !== "text"} />
              </span>
            ))}
          </div>
        )}
      </header>

      {order.map((key) => {
        if (key === "summary")
          return contact.summary?.trim() ? (
            <Section key={key} title="Summary">
              <p style={{ margin: 0, fontSize: base * 0.97 }}>{contact.summary}</p>
            </Section>
          ) : null;

        if (key === "experience")
          return experience.length ? (
            <Section key={key} title="Experience">
              {experience.map((e) => (
                <div key={e.id} style={{ marginBottom: 6 }}>
                  <SubLine
                    left={<b>{e.role || "Role"}</b>}
                    right={dateRange(e.startDate, e.endDate)}
                  />
                  <SubLine left={e.company} right={e.location ?? ""} italic />
                  {bulletList(e.bullets, base, bullet, bulletGap)}
                </div>
              ))}
            </Section>
          ) : null;

        if (key === "education")
          return education.length ? (
            <Section key={key} title="Education">
              {education.map((e) => (
                <div key={e.id} style={{ marginBottom: 6 }}>
                  <SubLine
                    left={<b>{e.school || "School"}</b>}
                    right={e.location ?? ""}
                  />
                  <SubLine
                    left={
                      <>
                        {e.degree}
                        {e.degree && e.gpa ? ` · GPA ${e.gpa}` : e.gpa ? `GPA ${e.gpa}` : ""}
                      </>
                    }
                    right={dateRange(e.startDate, e.endDate)}
                    italic
                  />
                  {bulletList(e.details, base, bullet, bulletGap)}
                </div>
              ))}
            </Section>
          ) : null;

        if (key === "projects")
          return projects.length ? (
            <Section key={key} title="Projects">
              {projects.map((p) => (
                <div key={p.id} style={{ marginBottom: 6 }}>
                  <SubLine
                    left={
                      <>
                        <b>{p.name || "Project"}</b>
                        {p.tech ? (
                          <>
                            {" "}
                            <span style={{ color: MUTED }}>|</span>{" "}
                            <i>{p.tech}</i>
                          </>
                        ) : null}
                      </>
                    }
                    right={dateRange(p.startDate, p.endDate)}
                  />
                  {bulletList(p.bullets, base, bullet, bulletGap)}
                </div>
              ))}
            </Section>
          ) : null;

        if (key === "skills")
          return skills.length ? (
            <Section key={key} title="Skills">
              {skills.map((g) => {
                const items = g.items.map((s) => s.trim()).filter(Boolean);
                if (!g.label.trim() && !items.length) return null;
                return (
                  <div
                    key={g.id}
                    style={{ marginBottom: 2, fontSize: base * 0.97 }}
                  >
                    {g.label && <b style={{ color: INK }}>{g.label}</b>}
                    {g.label ? ": " : ""}
                    {items.join(", ")}
                  </div>
                );
              })}
            </Section>
          ) : null;

        return null;
      })}
    </>
  );
}
