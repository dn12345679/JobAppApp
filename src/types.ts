// Domain model 

export type Role = "owner" | "editor" | "viewer";

export type ApplicationState = "NotApplied" | "InProgress" | "Applied";

// Stage is a per-workspace, user-editable label (see WorkspaceStage), so on a
// job it's just a free string.
export type AuthKind = "none" | "sso_google" | "has_login";

export type Flag = "red" | "yellow" | "green";

export interface Workspace {
  id: string;
  name: string;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  userId: string;
  workspaceId: string;
  role: Role;
  createdAt: string;
}

/** A user-defined application stage, scoped to a workspace and ordered. */
export interface WorkspaceStage {
  id: string;
  workspaceId: string;
  label: string;
  position: number;
}

export interface JobApplication {
  id: string;
  workspaceId: string;
  company: string;
  title: string;
  payMin: number | null;
  payMax: number | null;
  payMedian: number | null;
  hourly: boolean; // true = hourly rate, false = annual salary
  state: ApplicationState;
  stage: string | null; // a WorkspaceStage label
  interviewNumber: number | null;
  locationCity: string | null;
  locationState: string | null;
  remote: boolean;
  username: string | null;
  auth: AuthKind;
  notes: string | null;
  deadline: string | null; // ISO date
  dateApplied: string | null; // ISO date
  lastUpdate: string | null; // ISO timestamp
  nextInterviewDate: string | null; // ISO date
  endDate: string | null; // ISO date — when the role/engagement ended
  flag: Flag | null;
  link: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** Fields the user can supply when creating a job; everything else is defaulted. */
export type NewJobInput = Pick<JobApplication, "company" | "title"> &
  Partial<
    Omit<JobApplication, "id" | "workspaceId" | "createdAt" | "updatedAt">
  >;

// ---- Résumé profile (DESIGN.md §11) -----------------------------------------
// The Profile is per-USER (not per-workspace): the superset of career data. A
// résumé is a *view* over it (selection + order + template + density). Stored as
// one JSON document; every repeatable entry carries a stable `id` so the résumé
// view can reference/hide/reorder it without copying content.

export interface ContactInfo {
  fullName: string;
  email: string | null;
  phone: string | null;
  location: string | null; // "City, ST"
  website: string | null;
  linkedin: string | null;
  github: string | null;
  summary: string | null; // short headline / objective
}

export interface EducationEntry {
  id: string;
  school: string;
  degree: string | null; // "B.S. Computer Science"
  location: string | null;
  startDate: string | null; // free text ok: "2022" / ISO
  endDate: string | null; // "Present" allowed
  gpa: string | null;
  details: string[]; // bullets: honors, relevant coursework
}

export interface ExperienceEntry {
  id: string;
  company: string;
  role: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null; // null / "Present"
  bullets: string[];
}

export interface ProjectEntry {
  id: string;
  name: string;
  link: string | null;
  tech: string | null; // "React, Rust, SQLite"
  startDate: string | null;
  endDate: string | null;
  bullets: string[];
}

export interface SkillGroup {
  id: string;
  label: string; // "Languages"
  items: string[]; // ["TypeScript", "Rust"]
}

export type SectionKey =
  | "summary"
  | "experience"
  | "education"
  | "projects"
  | "skills";

export type ResumeTemplate = "classic" | "jake" | "twocol";
export type ResumeDensity = "roomy" | "normal" | "tight";
export type BulletStyle = "disc" | "circle" | "dash"; // filled dot / hollow / dash

/** The résumé "view": how the Profile is arranged to fit one page. */
export interface ResumeSettings {
  template: ResumeTemplate;
  density: ResumeDensity;
  bulletStyle: BulletStyle;
  fontScale: number; // clamped 0.9–1.1
  sectionOrder: SectionKey[];
  hidden: Record<string, boolean>; // entryId → excluded from the résumé
  autoFit: boolean; // step density down until it fits (bounded)
}

export interface ResumeProfile {
  id: string; // == userId (one row per user)
  userId: string;
  contact: ContactInfo;
  education: EducationEntry[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  skills: SkillGroup[];
  settings: ResumeSettings;
  createdAt: string;
  updatedAt: string;
}

/** The JSON payload stored in the `data` column (system fields live in columns). */
export type ResumeProfileData = Pick<
  ResumeProfile,
  "contact" | "education" | "experience" | "projects" | "skills" | "settings"
>;
