import type { EditorState, SceneObject } from '../types'
import { jsonToScene, sceneToJSON, type SavedScene } from './scene'

const KEY = 'ai-blender-scene'

export function saveScene(state: EditorState) {
  const json = sceneToJSON(state)
  localStorage.setItem(KEY, json)
}

export function loadScene(): SavedScene | null {
  const json = localStorage.getItem(KEY)
  if (!json) return null
  // First try the new format
  const decoded = jsonToScene(json)
  if (decoded) return decoded
  // Backward compatibility: legacy saves were an array of SceneObject
  try {
    const legacy = JSON.parse(json) as SceneObject[]
    if (Array.isArray(legacy)) {
      return {
        version: 1,
        editor: {
          objects: legacy,
          selectedId: null,
          mode: 'translate',
          editorMode: 'object',
          snap: { enableSnapping: false, translateSnap: 0.5, rotateSnap: Math.PI / 12, scaleSnap: 0.1 },
        },
      }
    }
  } catch {
    return null
  }
  return null
}
