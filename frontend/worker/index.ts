import { agentInfo, agentStep } from "./agent";
import { ROOM_ID } from "../src/collab/protocol";

export { Room } from "./room";

export default {
    async fetch(request, env) {
        const { pathname } = new URL(request.url);
        if (pathname === "/api/agent") {
            if (request.method === "POST") return agentStep(request, env);
            if (request.method === "GET") return agentInfo(env);
            return Response.json({ error: "Method not allowed", code: "bad_request" }, { status: 405, headers: { allow: "GET, POST" } });
        }
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
