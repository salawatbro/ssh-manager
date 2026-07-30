// What the file editor will open, and the numbers its chrome shows.
//
// The rule matches the design's copy ("Zish only edits text files under 2 MB"):
// anything else gets the "can't edit this file" panel instead of a textarea full
// of mojibake.
export const EDIT_SIZE_LIMIT = 2 * 1024 * 1024

// Extension allow-list rather than a binary sniff: the editor decides from a
// directory listing, before anything has been read off the host. Config, code,
// data, logs — the files someone opens over SFTP to fix something.
const TEXT_EXTENSIONS = new Set([
  'bash', 'c', 'cfg', 'conf', 'cnf', 'cpp', 'cs', 'css', 'csv', 'diff', 'env', 'go', 'h', 'hcl', 'html', 'ini',
  'java', 'js', 'json', 'jsx', 'key', 'kt', 'list', 'lock', 'log', 'lua', 'md', 'mjs', 'patch', 'php', 'pl',
  'properties', 'pub', 'py', 'rb', 'rs', 'service', 'sh', 'sql', 'svg', 'swift', 'toml', 'ts', 'tsv', 'tsx',
  'txt', 'xml', 'yaml', 'yml', 'zsh',
])

// Files with no extension that are text by convention, dotfiles included (the
// leading dot is stripped before the lookup). Compared lowercased, so
// `Dockerfile` and `dockerfile` both match. Anything else extension-less gets
// the can't-edit panel — `.DS_Store` is why this is an allow-list and not a
// blanket yes.
const TEXT_NAMES = new Set([
  'authorized_keys', 'bash_profile', 'bashrc', 'changelog', 'dockerfile', 'editorconfig', 'env', 'gemfile',
  'gitconfig', 'gitignore', 'hosts', 'jenkinsfile', 'known_hosts', 'license', 'makefile', 'notice', 'npmrc',
  'procfile', 'profile', 'rakefile', 'readme', 'vagrantfile', 'vimrc', 'zshrc',
])

export function isEditableFile(name: string, size: number): boolean {
  if (size > EDIT_SIZE_LIMIT) return false
  // A leading dot is part of the name, not an extension separator: without this
  // `.bashrc` would be read as the extension "bashrc".
  const lower = name.toLowerCase().replace(/^\.+/, '')
  const dot = lower.lastIndexOf('.')
  if (dot <= 0) return TEXT_NAMES.has(lower)
  return TEXT_EXTENSIONS.has(lower.slice(dot + 1))
}

export function lineCount(text: string): number {
  // A trailing newline does not open a new line in the gutter, but an empty
  // buffer is still line 1.
  return text.split('\n').length
}

export function gutterFor(text: string): string {
  return Array.from({ length: lineCount(text) }, (_, i) => String(i + 1)).join('\n')
}

// Bytes, not characters: a utf-8 file's size is what a user comparing this with
// the listing expects to see.
export function editorStats(text: string): string {
  const bytes = new TextEncoder().encode(text).length
  const lines = lineCount(text)
  return `${lines} ${lines === 1 ? 'line' : 'lines'} · ${bytes} bytes`
}
