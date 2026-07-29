# /design-sync notes — Zish

Repo-specific gotchas for the next sync. Config lives in `config.json`;
`conventions.md` is the header prepended to the uploaded README.

## What is being synced

Zish is an **app**, not a component library, so the sync covers a deliberate
slice: the **22 presentational components** that render from props alone — no
Wails bindings, no Zustand stores. `frontend/.ds-entry.tsx` (generated, see
below) re-exports exactly that set, and `cfg.componentSrcMap` pins the same 22
names. **Keep the two in sync** — a name in one and not the other silently
drops or breaks a component.

Everything else in `frontend/src/components/` is out of scope by construction:
it reads `stores/` or `bindings/` and cannot render in a browser.

## Pre-build steps (not automated — run these before the converter)

```sh
# 1. the DS entry (gitignored; canonical copy is .design-sync/entry.tsx)
cp .design-sync/entry.tsx frontend/.ds-entry.tsx

# 2. the DS stylesheet (gitignored; source is .design-sync/ds-styles.css)
node .ds-sync/node_modules/@tailwindcss/cli/dist/index.mjs \
  -i .design-sync/ds-styles.css -o frontend/.ds-styles.css --minify
```

Both outputs live under `frontend/` on purpose: the converter derives `PKG_DIR`
by walking up from `--entry` to the nearest `package.json` with a name, and
`cfg.cssEntry` is bounded to that directory. The repo root has no
`package.json`, so an entry outside `frontend/` resolves `PKG_DIR` wrong.

`@tailwindcss/cli` is an extra dep in `.ds-sync/` (`npm i @tailwindcss/cli@4.3.2`
— pin it to the version in `frontend/package.json`). So are `playwright@1.58.0`
(see below) and `typescript@5.9.3`.

Then, from the repo root:

```sh
node .ds-sync/resync.mjs --config .design-sync/config.json \
  --node-modules ./frontend/node_modules --entry ./frontend/.ds-entry.tsx \
  --out ./ds-bundle [--remote .design-sync/.cache/remote-sync.json]
```

## Why cfg.pkg is "zish-ui" and not the real package name

`frontend/package.json` is named `react-ts-latest` (a private app package — the
name is never published or imported). `cfg.pkg` is the identity the design
agent sees in every import example, so it is set to `zish-ui` instead. Nothing
resolves through it: `--entry` is explicit and previews import `zish-ui`
through the converter's package shim. **No repo file was renamed.**

## The stylesheet is static — this is the load-bearing constraint

Nothing compiles Tailwind downstream of this sync. `_ds_bundle.css` is a fixed
file, so a class that isn't already in it does nothing — in a preview *or* in
any design the agent builds. `ds-styles.css` therefore does two things: scans
`frontend/src` (every class the components use, arbitrary values included), and
force-generates a token × utility matrix plus a standard layout scale via
`@source inline(...)`.

Authored previews are deliberately **not** in that `@source` list, so they live
inside the same vocabulary a design agent gets. The guard for that:

```sh
node .design-sync/check-preview-classes.mjs [Name ...]
```

Run it before every capture. It caught real breakage during the first sync
(`h-[260px]` in a preview collapsed a modal card to ~50px). If a genuinely
common utility is missing, add it to `ds-styles.css`'s inline list and rebuild
the stylesheet — don't work around it in a preview.

## Preview conventions (all 22 previews follow these)

- Every cell paints its own surface: the card page hardcodes `background:#fff`,
  and this DS is dark-only. `<div className="bg-bg0 text-text font-sans p-4">`.
- Overlays (`ConfirmModal`, `PromptModal`) are `absolute inset-0` → wrap in a
  `relative h-64 overflow-hidden` "window". `FindBar` / `PaneNotice` are
  absolutely positioned in the terminal pane → same, with
  `style={{ background: 'var(--term-bg)' }}`.
- `ContextMenu` is `position: fixed` and escapes any wrapper → it is a
  `cardMode: "single"` card with one story (`cfg.overrides`).
- `DestFields` renders wider than a grid cell → `cardMode: "column"`.
- Block-level controls (`Stepper`, `Segmented`) stretch unless wrapped in
  `w-fit`, which is what a Row's `shrink-0` right side does in the app.
- Helper components inside a preview must NOT be exported — every named export
  becomes a card cell.

## Known render warns

None. The last full validate exited 0 with zero warnings.

## States that cannot render statically

- **FindBar** — the match counter (`3/9`, `no matches`, `240+`) is derived from
  the bar's OWN query state, which starts empty and only fills by typing. Every
  `results` value renders identically in a static capture, so the preview is a
  single cell by design, not an oversight.
- Hover / focus / drag states generally: the captures are static.

## Fonts

The app ships **no** font files and relies on a system-installed JetBrains Mono
(falling back to `ui-monospace`). The design system does ship it: four weights
of JetBrains Mono 2.304 (SIL OFL 1.1, `fonts/OFL.txt`) under
`.design-sync/fonts/`, wired via `cfg.extraFonts`. The user approved bundling
it on 2026-07-29. Without it, every mono surface in the DS pane would render in
a substitute face.

## Playwright

The render check needs playwright + chromium. This machine has chromium build
**1208** cached in `~/Library/Caches/ms-playwright/`, which is pinned by
**playwright 1.58.0** — install that exact version in `.ds-sync/` or the launch
fails with "Executable doesn't exist". (`typescript@5.9.3` is also needed for
the `.d.ts` parse check; `typescript@7.x` makes validate skip it silently.)

## Re-sync risks — what can go stale

- **`frontend/.ds-entry.tsx` and `frontend/.ds-styles.css` are gitignored.** A
  fresh clone has neither; run the two pre-build steps above first, or the
  converter fails with `[NO_DIST]` / drops all styling.
- **Components can drift out of the presentational slice.** If someone adds a
  `stores/` or `bindings/` import to one of the 22, its preview will render
  blank or throw. Re-check with:
  `for f in $(find frontend/src/components -name '*.tsx'); do grep -qE "from '(\.\./)*(stores|hooks)/|bindings|@wailsio" "$f" || echo "PURE $f"; done`
- **`cfg.dtsPropsFor` is hand-written for all 22.** The components declare
  local `interface Props`, not `<Name>Props`, and the repo emits no `.d.ts`, so
  automatic extraction finds nothing. A prop added in source will NOT appear in
  the uploaded contract until the config entry is updated by hand.
- **The `form` shape is inlined** in three `dtsPropsFor` entries
  (`TagsEditor`, `ServerFormGroup`, `TwoFactorFields`) because `ServerFormValues`
  is not resolvable in a standalone `.d.ts`. If `emptyForm()` in
  `ServerForm.tsx` changes, those three copies rot.
- **The Tailwind CLI version in `.ds-sync/` must track
  `frontend/package.json`.** A version skew changes the emitted CSS for the
  same source.
- The tokens the DS pane lists come from `_ds_bundle.css` — `tokens/` is empty
  because there is no separate tokens package (`copyTokens` needs a
  node_modules package, and `frontend/src/styles/tokens.css` cannot ship as-is:
  its `@import "tailwindcss"` would 404 in the browser).
