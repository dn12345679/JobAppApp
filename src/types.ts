// Domain model — mirrors DESIGN.md §5.

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
