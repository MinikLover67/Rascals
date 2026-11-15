// Whole-window file drop bridge: App owns the drag handlers + overlay and
// forwards dropped files here; the open ChatPanel picks them up and sends
// them to its own chat. Decoupled so drops work from anywhere on screen.

const DROP_FILES_EVENT = 'rascals-drop-files'

export function emitDropFiles(files: File[]): void {
  try {
    window.dispatchEvent(new CustomEvent<File[]>(DROP_FILES_EVENT, { detail: files }))
  } catch {
    // event system unavailable — drop is ignored
  }
}

export function onDropFiles(handler: (files: File[]) => void): () => void {
  const listener = (e: Event) => {
    const files = (e as CustomEvent<File[]>).detail
    if (Array.isArray(files) && files.length > 0) handler(files)
  }
  window.addEventListener(DROP_FILES_EVENT, listener)
  return () => window.removeEventListener(DROP_FILES_EVENT, listener)
}
