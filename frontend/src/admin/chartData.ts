// Colours and number helpers shared by the admin charts.

export type Point = { day: string; n: number };
export type Series = { key: string; label: string; color: string; data: Point[] };

export const COLORS = { blue: "#4f7bff", purple: "#a855f7", pink: "#ec4899", green: "#22c55e", amber: "#f5a524", red: "#e5484d", teal: "#14b8a6", slate: "#64748b" };
export const PALETTE = [COLORS.blue, COLORS.purple, COLORS.green, COLORS.amber, COLORS.pink, COLORS.teal, COLORS.red, COLORS.slate];

export const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
export const compact = (n: number) => (Math.abs(n) >= 10_000 ? `${Math.round(n / 1000)}k` : Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
export const total = (points: Point[] = []) => points.reduce((n, p) => n + p.n, 0);

// The latest `days` of a series that covers twice that, and the days before.
export function split(points: Point[] = [], days: number): { now: Point[]; before: Point[] } {
    return { now: points.slice(-days), before: points.slice(-2 * days, -days) };
}
