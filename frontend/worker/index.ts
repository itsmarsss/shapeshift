import { agentInfo, agentStep } from "./agent";

export default {
    async fetch(request, env) {
        const { pathname } = new URL(request.url);
        if (pathname === "/api/agent") {
            if (request.method === "POST") return agentStep(request, env);
            if (request.method === "GET") return agentInfo(env);
            return Response.json({ error: "Method not allowed", code: "bad_request" }, { status: 405, headers: { allow: "GET, POST" } });
        }
        if (pathname.startsWith("/api/")) return Response.json({ error: "Not found", code: "bad_request" }, { status: 404 });
        return env.ASSETS.fetch(request);
    },
} satisfies ExportedHandler<Env>;
