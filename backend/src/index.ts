import { agentInfo, agentStep } from "./agent";
import { ROOM_ID } from "../src/collab/protocol";
import { handleAccounts } from "./accounts";
import { handleScenes } from "./scenes";
import { handleWaitlist } from "./waitlist";
import { handlePublic, sharePage } from "./publicScenes";

export { Room } from "./room";

export default {
    async fetch(request, env) {
        const { pathname } = new URL(request.url);
        if (pathname === "/api/agent") {
            if (request.method === "POST") return agentStep(request, env);
            if (request.method === "GET") return agentInfo(env);
            return Response.json({ error: "Method not allowed", code: "bad_request" }, { status: 405, headers: { allow: "GET, POST" } });
        }
        const accounts = await handleAccounts(request, env);
        if (accounts) return accounts;
        const share = pathname.match(/^\/s\/([A-Za-z0-9]{10})\/?$/);
        if (share && request.method === "GET") return sharePage(request, env, share[1]);
        const publicScene = await handlePublic(request, env);
        if (publicScene) return publicScene;
        const waitlist = await handleWaitlist(request, env);
        if (waitlist) return waitlist;
        const scenes = await handleScenes(request, env);
        if (scenes) return scenes;
        const room = pathname.match(/^\/api\/rooms\/([^/]+)$/);
        if (room) {
            if (!ROOM_ID.test(room[1])) return Response.json({ error: "Invalid room id", code: "bad_request" }, { status: 400 });
            const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
            const { success } = await env.CHAT_LIMITER.limit({ key: `room:${ip}` });
            if (!success) return Response.json({ error: "Too many requests", code: "rate_limited" }, { status: 429 });
            return env.ROOMS.get(env.ROOMS.idFromName(room[1])).fetch(request);
        }
        if (pathname.startsWith("/api/")) return Response.json({ error: "Not found", code: "bad_request" }, { status: 404 });
        return env.ASSETS.fetch(request);
    },
} satisfies ExportedHandler<Env>;
