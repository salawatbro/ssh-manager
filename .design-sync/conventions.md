# Zish UI — how to build with it

Zish is a **dark-only macOS desktop app** (an SSH connection manager). These are
its real shipped components, compiled from the app's own source.

## Setup

No provider, no theme context — components read plain CSS custom properties.
Two rules:

1. Load `styles.css` (it `@import`s the fonts and `_ds_bundle.css`).
2. **Give your root element the app surface**: `className="bg-bg0 text-text font-sans"`.
   Component internals are dark-on-dark, so anything rendered on a white page
   looks broken. Fixed-size panes matter too: overlays (`ConfirmModal`,
   `PromptModal`) are `absolute inset-0`, and `FindBar` / `PaneNotice` are
   absolutely positioned inside the terminal pane — put them in a `relative`
   parent with a real height, not at page level. `ContextMenu` is `fixed` and
   takes viewport coordinates.

## The styling idiom: a Tailwind v4 theme, statically compiled

Style with **utility classes**; the colour vocabulary is this design system's
own token names (no `slate-500`, no `blue-600` — those do not exist here).

**Critical:** nothing compiles Tailwind downstream. `_ds_bundle.css` is a fixed
file, so **only classes it already contains have any effect.** That means the
scale utilities below, plus the exact arbitrary values the components
themselves use. A *new* arbitrary value you invent (`h-[260px]`, `text-[17px]`)
silently does nothing — use `style={{ height: 260 }}` for off-scale values.

| Family | Prefixes | Values |
|---|---|---|
| Surfaces | `bg-` | `bg0` (window) · `bg1` (panel) · `bg1b` · `bg2` (raised: menus, modals, chips) · `bgSel` (selected row) |
| Text | `text-` | `text` (primary) · `textMuted` (secondary) · `textDim` (tertiary) |
| Lines | `border-` | `border` (default) · `borderStrong` (emphasis) |
| Accent | `bg-`/`text-`/`border-` | `accent` (teal) · `accentDim` · `accentFg` · `onAccent` (text ON an accent fill) |
| Status | `bg-`/`text-`/`border-` | `stConnected` · `stConnecting` · `stFailed` · `stDisc` · `stUnknown` |
| Environment | `bg-`/`text-`/`border-` | `envProd` · `envStaging` · `envDev` |
| Terminal | `bg-`/`text-` | `termFg` · `termGreen` · `termBlue` · `termGood`; the full ANSI palette is `var(--term-*)` only |

`hover:` and `focus:` variants exist for all of the above. Also available:
spacing/sizing (`p-4`, `gap-3`, `h-64`, `max-w-2xl`, `w-full`, `mx-auto`),
type (`text-xs…text-4xl`, `font-mono`, `font-medium`, `font-semibold`,
`leading-*`, `tracking-*`), `rounded-{sm,md,lg,xl,full}`, `shadow-*`,
`grid-cols-1…6`, and the flex primitives.

**Two shape invariants — never mix them.** The environment axis is always a
**square** (`rounded-env`, a 2px radius); the status axis is always a **circle**
(`rounded-full`, drawn by `StatusDot`). The distinction has to survive colour
blindness, so never colour a non-environment element with `envProd`/
`envStaging`/`envDev`.

Terminal surfaces use the `--term-*` properties directly:
`style={{ background: 'var(--term-bg)', color: 'var(--term-fg)' }}` plus
`font-mono` (JetBrains Mono ships with this system).

## Where the truth is

- `_ds/<folder>/styles.css` and `_ds_bundle.css` — every token and every class
  that actually exists. Read them before inventing a class name.
- `components/<group>/<Name>/<Name>.prompt.md` — per-component usage;
  `<Name>.d.ts` — the exact props.

## Idiomatic example

```jsx
import { GroupHeader, StatusDot } from 'zish-ui'

<div className="bg-bg0 text-text font-sans p-4">
  <GroupHeader group="Production" count={3} env="prod" collapsed={false} onToggle={fold} />
  {servers.map((s) => (
    <div key={s.id} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-bgSel">
      <StatusDot status={s.status} />
      <span className="flex-1 truncate text-[13px]">{s.name}</span>
      <span className="text-[11.5px] text-textDim">{s.user}@{s.host}</span>
    </div>
  ))}
</div>
```

Chrome, not a document: the app disables text selection globally, sizes body
text at 13px, and uses tight, desktop-scale spacing. Match that density.
