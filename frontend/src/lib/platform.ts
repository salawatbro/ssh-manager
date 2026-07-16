// isMac drives the keymap. macOS uses ⌘ (Meta), which the OS never delivers to
// the pty; Windows/Linux use Ctrl+Shift for letters and Ctrl+<digit> for tabs
// (FR-09.3 — plain Ctrl+<letter> is reserved by readline: Ctrl+D EOF, Ctrl+W
// kill-word, Ctrl+K kill-line). navigator.platform is stable inside WKWebView.
export const isMac = navigator.platform.toLowerCase().includes('mac')
