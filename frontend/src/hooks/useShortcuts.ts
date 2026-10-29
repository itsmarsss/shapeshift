import { useEffect } from 'react'
import { useEditor } from '../store/editor'

export function useShortcuts() {
  const add = useEditor(s => s.addObject)
  const del = useEditor(s => s.deleteSelected)
  const dup = useEditor(s => s.duplicateSelected)
  const undo = useEditor(s => s.undo)
  const redo = useEditor(s => s.redo)
  const setMode = useEditor(s => s.setMode)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return
      
      // Command/Ctrl + L to show chat panel
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        useEditor.getState().setShowChatPanel(true)
        return
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo();
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault(); dup(); return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { del(); return }
      if (e.key.toLowerCase() === 'g') { setMode('translate'); return }
      if (e.key.toLowerCase() === 'r') { setMode('rotate'); return }
      if (e.key.toLowerCase() === 's') { setMode('scale'); return }
      if (e.key.toLowerCase() === '1') { add('box'); return }
      if (e.key.toLowerCase() === '2') { add('sphere'); return }
      if (e.key.toLowerCase() === '3') { add('cylinder'); return }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [add, del, dup, undo, redo, setMode])
}
