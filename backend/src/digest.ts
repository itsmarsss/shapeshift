import { listedSuperusers } from "./admin";
import { sendEmail } from "./email";
import { errorGroups } from "./metrics";

// Once a day (the cron in wrangler.jsonc), superusers get an email listing the
// errors people's browsers reported in the last day. Nothing is sent on a day
// without errors, or before the analytics token is set.
export async function sendErrorDigest(env: Env, origin = "https://tryshapeshift.com") {
    const to = listedSuperusers(env);
    if (!env.ANALYTICS_TOKEN || !to.length) return { sent: 0 };
    const errors = await errorGroups(env, 1);
    const total = errors.reduce((n, e) => n + e.n, 0);
    if (!total) return { sent: 0 };

    const lines = errors.slice(0, 8).map((e) => `• ${e.n}× ${e.message || "(no message)"}  [${e.place}${e.pages[0] ? `, ${e.pages[0].label}` : ""}, ${e.visitors} ${e.visitors === 1 ? "browser" : "browsers"}]`);
    const more = errors.length > 8 ? `\n…and ${errors.length - 8} more.` : "";
    const text = `${total} ${total === 1 ? "error was" : "errors were"} reported in the last day, ${errors.length} different.\n\n${lines.join("\n")}${more}\n\nDetails and stack traces: ${origin}/admin?s=health`;
    const subject = `ShapeShift: ${total} ${total === 1 ? "error" : "errors"} in the last day`;
    const results = await Promise.all(to.map((address) => sendEmail(env, { to: address, subject, text })));
    return { sent: results.filter((r) => r.ok).length };
}
