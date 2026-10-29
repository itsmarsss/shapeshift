import { aiTools } from '../src/scene/aiTools'

const MODEL = '@cf/zai-org/glm-4.7-flash'

const tools = aiTools() as unknown as ChatCompletionTool[]

const systemPrompt = `You edit a 3D scene by calling tools. Call every tool needed for the request in one reply.
- Units are meters. Y is up and the ground is y = 0. A primitive of height h rests on the ground at y = h/2.
- Rotations are radians. Convert degrees.
- Refer to objects by their exact name from the scene list. "It" means the selected object.
- When adding several objects, give each a position so they do not overlap.
- Reply with one short sentence. Only answer in text when no tool fits.`

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type ChatRequest = { messages?: unknown; scene?: unknown }

function isMessage(m: unknown): m is ChatMessage {
  if (!m || typeof m !== 'object') return false
  const { role, content } = m as Record<string, unknown>
  return (role === 'user' || role === 'assistant') && typeof content === 'string'
}

async function chat(request: Request, env: Env) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const { success } = await env.CHAT_LIMITER.limit({ key: ip })
  if (!success) return Response.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json<ChatRequest>().catch(() => ({}) as ChatRequest)
  const history = Array.isArray(body.messages) ? body.messages.filter(isMessage).slice(-10) : []
  if (!history.length || history[history.length - 1].role !== 'user') {
    return Response.json({ error: 'Missing user message' }, { status: 400 })
  }
  if (history.some((m) => m.content.length > 2000)) return Response.json({ error: 'Message too long' }, { status: 400 })
  const scene = typeof body.scene === 'string' ? body.scene.slice(0, 8000) : ''

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: `Scene:\n${scene || '(empty)'}` },
    ...history,
  ]

  try {
    const result = await env.AI.run(MODEL, { messages, tools, temperature: 0 })
    return Response.json(result)
  } catch (err) {
    console.error('AI request failed', err)
    return Response.json({ error: 'Request failed' }, { status: 502 })
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/api/chat' && request.method === 'POST') return chat(request, env)
    if (pathname.startsWith('/api/')) return Response.json({ error: 'Not found' }, { status: 404 })
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
