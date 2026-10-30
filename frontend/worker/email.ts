export type Email = { to: string; subject: string; text: string; html?: string };

// Sends through Resend when RESEND_API_KEY is set. Without it (local
// development), the message is logged instead so sign-in still works offline.
export async function sendEmail(env: Env, email: Email): Promise<{ ok: boolean; dev?: boolean }> {
    if (!env.RESEND_API_KEY) {
        console.log(`[email to ${email.to}] ${email.subject}\n${email.text}`);
        return { ok: true, dev: true };
    }
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.EMAIL_FROM || "ShapeShift <hello@shapeshift.hanzpo.com>", to: [email.to], subject: email.subject, text: email.text, html: email.html }),
    });
    if (!res.ok) console.error("Email failed", res.status, await res.text().catch(() => ""));
    return { ok: res.ok };
}
