import type { EditorState, SceneObject, SnapSettings } from '../types'

interface SavedEditorState {
  objects: SceneObject[]
  selectedId: string | null
  mode: EditorState['mode']
  editorMode: EditorState['editorMode']
  snap: SnapSettings
}

export interface SavedScene {
  version: 1
  editor: SavedEditorState
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function coerceSceneObjectArray(value: unknown): SceneObject[] {
  if (!Array.isArray(value)) return []
  return value.filter((o) => isObject(o)) as unknown as SceneObject[]
}

function coerceSnapSettings(value: unknown): SnapSettings {
  if (!isObject(value)) {
    return { enableSnapping: false, translateSnap: 0.5, rotateSnap: Math.PI / 12, scaleSnap: 0.1 }
  }
  const v = value as Partial<SnapSettings>
  return {
    enableSnapping: Boolean(v.enableSnapping),
    translateSnap: typeof v.translateSnap === 'number' ? v.translateSnap : 0.5,
    rotateSnap: typeof v.rotateSnap === 'number' ? v.rotateSnap : Math.PI / 12,
    scaleSnap: typeof v.scaleSnap === 'number' ? v.scaleSnap : 0.1,
  }
}

export function serializeScene(state: EditorState): SavedScene {
  const editor: SavedEditorState = {
    objects: JSON.parse(JSON.stringify(state.objects)),
    selectedId: state.selectedId,
    mode: state.mode,
    editorMode: state.editorMode,
    snap: { ...state.snap },
  }
  return { version: 1, editor }
}

export function deserializeScene(input: unknown): SavedScene | null {
  if (!isObject(input)) return null
  const version = input.version
  const editor = input.editor
  if (version !== 1 || !isObject(editor)) return null
  const ed = editor as Record<string, unknown>
  const objects = coerceSceneObjectArray(ed.objects)
  const selectedId = typeof ed.selectedId === 'string' || ed.selectedId === null ? (ed.selectedId as string | null) : null
  const mode = (ed.mode === 'translate' || ed.mode === 'rotate' || ed.mode === 'scale') ? (ed.mode as EditorState['mode']) : 'translate'
  const editorMode = (ed.editorMode === 'object' || ed.editorMode === 'edit') ? (ed.editorMode as EditorState['editorMode']) : 'object'
  const snap = coerceSnapSettings(ed.snap)
  return { version: 1, editor: { objects, selectedId, mode, editorMode, snap } }
}

export function sceneToJSON(state: EditorState): string {
  return JSON.stringify(serializeScene(state))
}

export function jsonToScene(json: string): SavedScene | null {
  try {
    const data = JSON.parse(json)
    return deserializeScene(data)
  } catch {
    return null
  }
}


