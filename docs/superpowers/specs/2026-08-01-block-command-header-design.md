# Block command header and zero-output layout

**Status:** implemented on `feat/term-completion`.

## Goal

Every real command block must show the command the user submitted, including
commands such as `cd`, `mkdir` and `touch` that normally produce no output.
Finished zero-output commands must render as compact header-only blocks instead
of showing an empty output body and a meaningless fold control.

## Command source

The compose input is authoritative. Immediately before a command is actually
written to the PTY, `blockSession` calls `machine.expectCommand(command)`. The
machine keeps these expected commands in FIFO order. When OSC 133 C starts a
real block, it consumes the next expected command; when none exists, it falls
back to the sanitised PTY echo captured between OSC 133 B and C.

The expectation is registered inside the guard-approved `send` callback. A
cancelled production guard therefore leaves no stale command. Completion probes
are identified first and never consume the real-command queue. Rerun follows
the same `submit` path and receives the same guarantee.

`TermBlock.command` remains the single command field used by display, rerun and
block actions. PTY echo remains a compatibility fallback for commands not
originating from the compose input.

## Zero-output presentation

A pure predicate determines whether an HTML-mode block contains visible output.
For a finished block with none:

- the command header, duration, exit status, rerun and copy actions remain;
- the output body is omitted;
- the fold toggle and folded-summary row are omitted.

Running blocks keep their streaming status. Blocks with visible output and all
xterm-mode blocks retain their current rendering and folding behavior.

## Tests and boundaries

Tests cover client-authoritative `cd`, PTY-echo fallback, guard cancellation,
completion probes not consuming a command, zero-output detection and ordinary
output preservation. The frontend suite and `task check` must pass, and touched
frontend files remain at or below 250 lines.
