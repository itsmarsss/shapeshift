const MODEL = '@cf/zai-org/glm-4.7-flash'

const tools: ChatCompletionTool[] = [
  { type: 'function', function: { name: 'addObject', description: 'Add a primitive to the scene', parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane'] }, params: { type: 'object', additionalProperties: true } }, required: ['kind'] } } },
  { type: 'function', function: { name: 'selectObject', description: 'Select an object by id or name', parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } } },
  { type: 'function', function: { name: 'updateTransform', description: 'Update position, rotation (radians), or scale. Use deltas when requested to move/rotate/scale by amounts.', parameters: { type: 'object', properties: { id: { type: 'string' }, position: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } }, rotation: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } }, scale: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } }, isDelta: { type: 'boolean', description: 'If true, apply values as deltas (additive). Otherwise set absolute.' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'updateTransformMany', description: 'Batch update transforms for multiple objects. Use isDelta true for relative moves.', parameters: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, target: { type: 'string' }, position: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } }, rotation: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } }, scale: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } }, isDelta: { type: 'boolean' } } } } }, required: ['items'] } } },
  { type: 'function', function: { name: 'updateMaterial', description: 'Set material color (hex), metalness, roughness, opacity', parameters: { type: 'object', properties: { id: { type: 'string' }, color: { type: 'string' }, metalness: { type: 'number' }, roughness: { type: 'number' }, opacity: { type: 'number' }, transparent: { type: 'boolean' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'updateMaterialMany', description: 'Batch update materials for multiple objects.', parameters: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, target: { type: 'string' }, color: { type: 'string' }, metalness: { type: 'number' }, roughness: { type: 'number' }, opacity: { type: 'number' }, transparent: { type: 'boolean' } } } } }, required: ['items'] } } },
  { type: 'function', function: { name: 'updateGeometry', description: 'Change geometry kind and optional params', parameters: { type: 'object', properties: { id: { type: 'string' }, kind: { type: 'string', enum: ['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane'] }, params: { type: 'object', additionalProperties: true } }, required: ['id', 'kind'] } } },
  { type: 'function', function: { name: 'duplicateSelected', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'deleteSelected', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'booleanOp', description: 'Run boolean operation between two objects A and B', parameters: { type: 'object', properties: { op: { type: 'string', enum: ['union', 'subtract', 'intersect'] }, a: { type: 'string' }, b: { type: 'string' } }, required: ['op', 'a', 'b'] } } },
  { type: 'function', function: { name: 'undo', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'redo', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'toggleSnap', parameters: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'] } } },
  { type: 'function', function: { name: 'setSnap', parameters: { type: 'object', properties: { translateSnap: { type: 'number' }, rotateSnap: { type: 'number' }, scaleSnap: { type: 'number' } } } } },
  { type: 'function', function: { name: 'setMode', parameters: { type: 'object', properties: { mode: { type: 'string', enum: ['translate', 'rotate', 'scale'] } }, required: ['mode'] } } },
  { type: 'function', function: { name: 'addRepeatedObjects', description: 'Add N primitives spaced to avoid overlap. Default spacingX is based on size or 1.2 units.', parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane'] }, count: { type: 'integer', minimum: 1 }, params: { type: 'object', additionalProperties: true }, spacingX: { type: 'number' }, spacingY: { type: 'number' }, spacingZ: { type: 'number' }, startX: { type: 'number' }, startY: { type: 'number' }, startZ: { type: 'number' } }, required: ['kind','count'] } } },
  { type: 'function', function: { name: 'updateName', description: 'Rename an object by id or exact name', parameters: { type: 'object', properties: { id: { type: 'string' }, target: { type: 'string' }, name: { type: 'string' } }, required: ['name'] } } },
]

const systemPrompt = `You are a 3D modeling copilot. Use the provided tools to carry out user requests in a precise, deterministic way.
- Prefer tool calls over text responses whenever possible.
- Units: position/scale in editor units. Rotation is in radians; if the user gives degrees, convert to radians.
- If the user asks to "move/rotate/scale by" amounts, use isDelta: true.
- When the user refers to objects by name, assume exact match on existing scene object names if provided in context.
- For requests that target multiple meshes at once (e.g., "set all legs red", "move A, B, C by x 0.5"), use updateTransformMany or updateMaterialMany with all items batched in one response.
- For requests like "add N boxes/cylinders", prefer addRepeatedObjects to ensure non-overlapping placement using spacing.
- When the user asks to rename something, use updateName.
Only produce natural language when no tool call is appropriate.`

type ChatRequest = {
  user?: unknown
  sceneSummary?: unknown
  focusContext?: unknown
}

async function chat(request: Request, env: Env) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const { success } = await env.CHAT_LIMITER.limit({ key: ip })
  if (!success) return Response.json({ error: 'Too many requests' }, { status: 429 })

  const { user, sceneSummary, focusContext } = await request.json<ChatRequest>().catch(() => ({}) as ChatRequest)
  if (!user || typeof user !== 'string') return Response.json({ error: 'Missing user prompt' }, { status: 400 })
  if (user.length > 2000) return Response.json({ error: 'Prompt too long' }, { status: 400 })

  const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: systemPrompt }]
  if (typeof focusContext === 'string' && focusContext) messages.push({ role: 'system', content: `Focus: ${focusContext.slice(0, 8000)}` })
  if (typeof sceneSummary === 'string' && sceneSummary) messages.push({ role: 'system', content: `Scene: ${sceneSummary.slice(0, 8000)}` })
  messages.push({ role: 'user', content: user })

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
