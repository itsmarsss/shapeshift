import { AwsClient } from "aws4fetch";

export type Email = { to: string; subject: string; text: string; html?: string };

export function emailConfigured(env: Env) {
    return Boolean(env.AWS_SES_ACCESS_KEY_ID && env.AWS_SES_SECRET_ACCESS_KEY);
}

// Sends through Amazon SES when its keys are set. Without them (local
// development), the message is logged instead so sign-in still works offline.
export async function sendEmail(env: Env, email: Email): Promise<{ ok: boolean; dev?: boolean }> {
    if (!emailConfigured(env)) {
        console.log(`[email to ${email.to}] ${email.subject}\n${email.text}`);
        return { ok: true, dev: true };
    }
    const region = env.AWS_SES_REGION || "us-east-1";
    const aws = new AwsClient({ accessKeyId: env.AWS_SES_ACCESS_KEY_ID!, secretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY!, service: "ses", region });
    const res = await aws.fetch(`https://email.${region}.amazonaws.com/v2/email/outbound-emails`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            FromEmailAddress: env.EMAIL_FROM || "ShapeShift <hello@tryshapeshift.com>",
            Destination: { ToAddresses: [email.to] },
            Content: {
                Simple: {
                    Subject: { Data: email.subject, Charset: "UTF-8" },
                    Body: { Text: { Data: email.text, Charset: "UTF-8" }, ...(email.html ? { Html: { Data: email.html, Charset: "UTF-8" } } : {}) },
                },
            },
        }),
    });
    if (!res.ok) console.error("Email failed", res.status, await res.text().catch(() => ""));
    return { ok: res.ok };
}
