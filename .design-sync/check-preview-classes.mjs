// Guard for authored previews: every Tailwind class a preview writes must
// exist in the stylesheet the design system actually ships
// (frontend/.ds-styles.css). Nothing compiles Tailwind downstream — the DS
// pane and every design built with it get that one static file — so a class
// that isn't in it silently does nothing.
//
// Preview files are deliberately NOT in ds-styles.css's @source list: they
// must live inside the same vocabulary a design agent gets. This script is
// how that stays true.
//
//   node .design-sync/check-preview-classes.mjs [Name ...]
//
// Exit 1 (and a per-file list) when a class is missing. Classes on the
// components' own markup are always fine — those files ARE scanned.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PREVIEWS = '.design-sync/previews';
const CSS = 'frontend/.ds-styles.css';

const css = readFileSync(CSS, 'utf8');
// Tailwind escapes every char outside [A-Za-z0-9_-] with a BACKSLASH in the
// emitted selector (`.text-\[13px\]`). Build that selector, then escape the
// result again for the regex — the backslash is literal text in the CSS.
const cssEscape = (cls) => cls.replace(/[^A-Za-z0-9_-]/g, (c) => `\\${c}`);
const rxEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (cls) => {
  // A variant-prefixed class keeps the whole thing in the selector
  // (`.hover\:bg-bg2:hover`), so match on the full escaped string either way.
  const sel = rxEscape(cssEscape(cls));
  return new RegExp(`\\.${sel}(?![A-Za-z0-9_-])`).test(css);
};

const only = process.argv.slice(2);
const files = readdirSync(PREVIEWS)
  .filter((f) => f.endsWith('.tsx'))
  .filter((f) => !only.length || only.includes(f.slice(0, -4)));

let bad = 0;
for (const f of files) {
  const src = readFileSync(join(PREVIEWS, f), 'utf8');
  const missing = new Set();
  // className="…" and className={`…`} — template holes are skipped, so a
  // conditional class built by interpolation is checked per literal chunk.
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
    const text = m[1] ?? m[2] ?? m[3] ?? '';
    for (const chunk of text.split(/\$\{[^}]*\}/)) {
      for (const cls of chunk.split(/\s+/).filter(Boolean)) {
        if (!has(cls)) missing.add(cls);
      }
    }
  }
  if (missing.size) {
    bad++;
    console.error(`✗ ${f}: ${[...missing].join(' ')}`);
  }
}

if (bad) {
  console.error(
    `\n${bad} preview(s) use classes the shipped stylesheet doesn't define. Replace them with scale utilities that exist (p-4, gap-3, h-64, text-sm …), a token utility (bg-bg2, text-textMuted …), or an inline style using var(--color-*).`,
  );
  process.exit(1);
}
console.error(`✓ ${files.length} preview(s): every class exists in ${CSS}`);
