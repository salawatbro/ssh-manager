import { toastSuccess } from '../stores/toasts'

// A menu item's copy: best-effort, since the clipboard can refuse (an
// unfocused window, a denied permission) and a menu has nowhere to say so.
export async function copyText(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toastSuccess(done)
  } catch {
    // nothing to undo
  }
}
