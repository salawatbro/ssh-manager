import { useFullscreen } from '../../stores/fullscreen'

// The sidebar's top band: the native traffic lights sit here and it drags the
// window. Fullscreen hides the lights, so the band shrinks to `fullscreenHeight`.
export function TitleBand({ fullscreenHeight }: { fullscreenHeight: number }) {
  const fullscreen = useFullscreen((s) => s.on)
  return <div className="drag shrink-0" style={{ height: fullscreen ? fullscreenHeight : 52 }} />
}
