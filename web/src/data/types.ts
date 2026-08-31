export type Kind = "feature" | "bug" | "chore" | "task" | "epic";

export type Issue = {
  n: number;
  title: string;
  kind: Kind;
  open: boolean;
  tier: string;
  priority: "P0" | "P1" | "P2" | "P3" | "";
  areas: string[];
  /** One or two sentences: the problem this closed. */
  why: string;
  /** The acceptance criterion, in plain words — what the camera has to show. */
  proof: string;
  /** Exact screen-recording steps. */
  record: string[];
  /** Bento emphasis on the catalogue grid. */
  span?: "wide" | "tall";
};

export type Tier = {
  id: string;
  label: string;
  name: string;
  goal: string;
  shipped: boolean;
};

export const REPO = "https://github.com/niyamvora/component-picker";
export const issueUrl = (n: number) => `${REPO}/issues/${n}`;
