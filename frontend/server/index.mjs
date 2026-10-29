import express from 'express'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

const app = express()
const PORT = process.env.PORT || 8787

app.use(express.json({ limit: '20mb' }))
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

function getLlms() {
  const martianKey = process.env.MARTIAN_API_KEY || process.env.VITE_MARTIAN_API_KEY
  const martianBase = process.env.MARTIAN_BASE_URL || 'https://api.withmartian.com/v1'

  if (martianKey) {
    return { provider: 'martian', baseUrl: martianBase, apiKey: martianKey, model: process.env.MARTIAN_MODEL || process.env.LLM_MODEL || 'openai/gpt-4.1-nano' }
  }
  return null
}

const tools = [
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

app.get('/api/health', (req, res) => {
  const llm = getLlms()
  res.json({ ok: !!llm, provider: llm?.provider ?? null, baseUrl: llm?.baseUrl ?? null, model: llm?.model ?? null, hasKey: !!llm?.apiKey })
})

app.post('/api/chat', async (req, res) => {
  const llm = getLlms()
  if (!llm) return res.status(500).json({ error: 'No LLM API key configured. Set MARTIAN_API_KEY (+ optional MARTIAN_BASE_URL) or OPENAI_API_KEY.' })

  const { user, sceneSummary, focusContext } = req.body || {}
  if (!user || typeof user !== 'string') return res.status(400).json({ error: 'Missing user prompt' })

  const messages = [
    { role: 'system', content: systemPrompt },
    focusContext ? { role: 'system', content: `Focus: ${focusContext}` } : null,
    sceneSummary ? { role: 'system', content: `Scene: ${sceneSummary}` } : null,
    { role: 'user', content: user }
  ].filter(Boolean)

  const url = `${llm.baseUrl.replace(/\/$/, '')}/chat/completions`

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llm.apiKey}`,
      },
      body: JSON.stringify({
        model: llm.model,
        temperature: 0,
        messages,
        tools,
        tool_choice: 'auto'
      })
    })
    const data = await r.json()
    if (!r.ok) {
      console.error('Upstream error', data)
      return res.status(500).json({ error: 'Upstream error', details: data })
    }
    return res.json(data)
  } catch (err) {
    console.error('Request failed', err)
    return res.status(500).json({ error: 'Request failed', details: String(err) })
  }
})

const detected = getLlms()
console.log(`[LLM] provider=${detected?.provider ?? 'none'} base=${detected?.baseUrl ?? 'n/a'} model=${detected?.model ?? 'n/a'} hasKey=${!!detected?.apiKey}`)

app.listen(PORT, () => {
  console.log(`LLM server listening on http://localhost:${PORT}`)
}) 