import { motion } from "framer-motion";
import type { ResumeProfile, ResumeTemplate } from "../../types";
import { PAGE_H, PAGE_W, Sheet } from "./ResumePreview";

// A Google-Docs-style visual picker: each card is a live, scaled render of the
// template (using sample content) so you see the layout before choosing.

const THUMB_W = 208;

const TEMPLATES_META: {
  id: ResumeTemplate;
  name: string;
  blurb: string;
}[] = [
  { 
    id: "classic", 
    name: "Classic", 
    blurb: "Centered serif header, clean sections." },
  {
    id: "jake",
    name: "Jake Gutierrez",
    blurb: "Small-caps, ruled headings, dense one-page.",
  },
  {
    id: "twocol",
    name: "Two-column",
    blurb: "Sans-serif sidebar: skills/education left, experience right.",
  },

];

// Representative content so thumbnails always read well, independent of what the
// user has entered so far.
const SAMPLE: ResumeProfile = {
  id: "sample",
  userId: "sample",
  contact: {
    fullName: "Nylad Guyen",
    email: "Nylad@email.com",
    phone: "(555) 010-2020",
    location: "Seattle, WA",
    website: "",
    linkedin: "linkedin.com/in/NG1983",
    github: "github.com/NG1983",
    summary: "",
  },
  experience: [
    {
      id: "x1",
      role: "Software Engineer Intern",
      company: "Acme Corp",
      location: "Seattle, WA",
      startDate: "June 2025",
      endDate: "Sept 2025",
      bullets: [
        "Built a data pipeline processing 6,500+ records across services.",
        "Shipped a React dashboard adopted by the whole team.",
      ],
    },
  ],
  education: [
    {
      id: "e1",
      school: "University of Washington",
      degree: "B.S. Computer Science",
      location: "Seattle, WA",
      startDate: "2023",
      endDate: "2026",
      gpa: "3.8",
      details: [],
    },
  ],
  projects: [
    {
      id: "p1",
      name: "Résumé Builder",
      link: "",
      tech: "React, Rust",
      startDate: "2025",
      endDate: "2025",
      bullets: ["Desktop app with offline sync and PDF export."],
    },
  ],
  skills: [
    { id: "s1", label: "Languages", items: ["TypeScript", "Python", "SQL"] },
    { id: "s2", label: "Tools", items: ["Git", "Docker", "Figma"] },
  ],
  settings: {
    template: "classic",
    density: "normal",
    bulletStyle: "disc",
    fontScale: 1,
    sectionOrder: ["summary", "experience", "education", "projects", "skills"],
    hidden: {},
    autoFit: false,
  },
  createdAt: "",
  updatedAt: "",
};

export default function TemplateGallery({
  current,
  onSelect,
  onClose,
}: {
  current: ResumeTemplate;
  onSelect: (t: ResumeTemplate) => void;
  onClose: () => void;
}) {
  // Read the page constants at render time, not module-eval time, to sidestep
  // the ResumePreview ⇄ TemplateGallery import cycle's temporal dead zone.
  const scale = THUMB_W / PAGE_W;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
    >
      <motion.div
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 12 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">
            Choose a template
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Automatically converts the resume to these template formats.
        </p>

        <div className="flex flex-wrap justify-center gap-4 overflow-auto pr-1">
          {TEMPLATES_META.map((t) => {
            const selected = t.id === current;
            return (
              <button
                key={t.id}
                onClick={() => onSelect(t.id)}
                className={`group flex flex-col rounded-xl border p-2 text-left transition-colors ${
                  selected
                    ? "border-indigo-500 bg-slate-900/60 ring-1 ring-indigo-500"
                    : "border-slate-700 bg-slate-900/40 hover:border-slate-500"
                }`}
                style={{ width: THUMB_W + 16 }}
              >
                <div
                  className="relative overflow-hidden rounded-md border border-slate-700"
                  style={{ width: THUMB_W, height: PAGE_H * scale }}
                >
                  <div
                    style={{
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                      width: PAGE_W,
                      pointerEvents: "none",
                    }}
                  >
                    <Sheet
                      profile={{
                        ...SAMPLE,
                        settings: { ...SAMPLE.settings, template: t.id },
                      }}
                    />
                  </div>
                  {selected && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      Current
                    </span>
                  )}
                </div>
                <div className="mt-2 px-0.5">
                  <div className="text-sm font-medium text-slate-100">
                    {t.name}
                  </div>
                  <div className="text-xs text-slate-500">{t.blurb}</div>
                </div>
              </button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
