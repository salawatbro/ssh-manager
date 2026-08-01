# Completion popup navigation and live filtering

**Status:** approved for implementation on `feat/term-completion`.

## Goal

Keep the block-terminal completion popup fully visible when the terminal is
scrolled, keep the highlighted row visible during keyboard navigation, and
filter the existing candidate snapshot while the user continues typing.

## Positioning

`CompletionPopup` renders through a React portal into `document.body` with
`position: fixed`. It measures the compose input with
`getBoundingClientRect()`, opens above when enough space exists, otherwise
below, and clamps its horizontal position to the viewport. Rendering outside
the terminal's overflow container prevents clipping without changing the
user's terminal scroll position.

The position is recalculated while the popup is open when the viewport resizes
or any ancestor scrolls. Mouse selection continues to use `onMouseDown` with
`preventDefault`, preserving compose-input focus.

## Keyboard navigation

ArrowDown and ArrowUp wrap through the visible result set. Each rendered row
has a ref; when `selected` changes, the active row calls
`scrollIntoView({ block: 'nearest' })`. Navigating beyond the popup's current
viewport therefore scrolls the popup, while the terminal itself stays still.

Tab and Enter apply the highlighted result. Escape closes the popup.

## Live filtering

The candidate list returned by the shell is retained as the source snapshot.
While the popup is open, normal text editing is allowed instead of closing the
popup. After each input change, the token under the caret is unescaped and the
source candidates are filtered with case-sensitive `startsWith`, matching the
remote shell's normal filename semantics. For example, typing `api.` leaves
only candidates whose full completion value starts with `api.`.

Filtering resets selection to the first row. Zero matches closes the popup.
Backspace, Delete, paste and ordinary printable input all use the same input
event path. Caret movement that changes the active token also refreshes the
filter. A fresh Tab still re-queries the shell and replaces the source snapshot.

## Boundaries and tests

Pure filtering and selection-clamping logic lives under
`lib/blockTerminal/` and is unit-tested. The React component remains a thin
view responsible for measurement, portal rendering and selected-row scrolling.

Tests cover prefix filtering, empty/no-match cases, selection reset/clamping
and the existing completion security/round-trip behavior. Typecheck, the full
frontend suite and `task check` must pass. All frontend files stay at or below
250 lines.
