// Domain model — mirrors DESIGN.md §5.

export type Role = "owner" | "editor" | "viewer";

export type ApplicationState = "NotApplied" | "InProgress" | "Applied";

export type ApplicationStage =
  | "InReview"
  | "Interview"
  | "Rejected"
  | "Accepted"
  | "Declined";

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

export interface JobApplication {
  id: string;
  workspaceId: string;
  company: string;
  title: string;
  payMin: number | null;
  payMax: number | null;
  payMedian: number | null;
  state: ApplicationState;
  stage: ApplicationStage | null;
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
