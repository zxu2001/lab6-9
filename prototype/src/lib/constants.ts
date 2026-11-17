// Shared, client-safe constants (no server imports here).

export const CATEGORIES = [
  "General",
  "Groceries",
  "Rent & Utilities",
  "Dining",
  "Travel",
  "Transport",
  "Entertainment",
  "Household",
] as const;

export type ActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const initialActionState: ActionState = { status: "idle" };

/** Local calendar date as YYYY-MM-DD (for <input type="date"> defaults). */
export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
