import { TerminalPreview } from 'zish-ui'

function Surface({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg1 text-text font-sans p-4">
      <div className="max-w-xl">{children}</div>
    </div>
  )
}

// The static mock the Settings > Terminal section shows above the controls.
// Colours come from the same --term-* properties the real terminal reads.
export function Default() {
  return (
    <Surface>
      <TerminalPreview fontSize={13} cursor="block" blink />
    </Surface>
  )
}

// The caret is the variant axis: block / bar / underline.
export function CursorShapes() {
  return (
    <Surface>
      <TerminalPreview fontSize={13} cursor="block" blink={false} />
      <TerminalPreview fontSize={13} cursor="bar" blink={false} />
      <TerminalPreview fontSize={13} cursor="underline" blink={false} />
    </Surface>
  )
}

export function FontSizes() {
  return (
    <Surface>
      <TerminalPreview fontSize={11} cursor="block" blink={false} />
      <TerminalPreview fontSize={16} cursor="block" blink={false} />
    </Surface>
  )
}
