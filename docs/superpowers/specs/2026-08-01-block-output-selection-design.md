# Block output control-byte cleanup and selection

**Status:** approved for implementation on `feat/term-completion`.

## Goal

Remove leaked terminal control glyphs from block output and make command/output
text selectable and copyable with native macOS and browser interactions.

## Control-byte cleanup

The Bash integration's `PS0` OSC 133 C marker must not use `\[` and `\]`.
Those prompt-width delimiters belong in readline-rendered `PS1`; in `PS0` they
can emit SOH/STX control bytes around the marker. The trailing byte lands after
OSC 133 C and is therefore parsed as command output, producing the unknown-box
glyph seen before otherwise empty output.

The snippet removes those wrappers while retaining the exact OSC marker. As a
defence in depth, the HTML ANSI parser drops unsupported C0 and DEL bytes after
handling its supported newline, carriage return, backspace and tab semantics.
Control bytes can never become visible text segments.

## Selection and copy

Block command text and HTML output opt back into the app's existing
`.selectable` utility, overriding the desktop-wide `user-select: none` rule.
Selection guards already present on block activation and links remain in place,
so completing a drag selection neither focuses the compose input nor opens a
selected URL.

The global context-menu suppression exempts `.selectable`, allowing the native
Copy menu on block text. While a command is running, the raw-key handler allows
the platform copy chord through when a non-empty DOM selection exists. Without
a selection, Ctrl+C keeps its existing terminal-interrupt behavior.

## Tests and boundaries

Tests lock the Bash `PS0` encoding, ANSI removal of SOH/STX and the pure
selection-copy chord decision for macOS and non-macOS. Existing terminal key,
OSC, snippet and selection guards remain unchanged. The frontend suite and
`task check` must pass, with all frontend files at or below 250 lines.
