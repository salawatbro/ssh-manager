// isMac drives the keymap. macOS uses ⌘ (Meta); Windows/Linux use Ctrl+Shift
// for letters (FR-09.3 — plain Ctrl+<letter> is reserved by readline: Ctrl+D
// EOF, Ctrl+W kill-word, Ctrl+K kill-line). navigator.platform is stable
// inside WKWebView.
export const isMac = navigator.platform.toLowerCase().includes('mac')
