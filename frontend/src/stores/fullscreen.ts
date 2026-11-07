import { create } from 'zustand'
import { Events, Window } from '@wailsio/runtime'

export const useFullscreen = create<{ on: boolean }>(() => ({ on: false }))

// WillExit rather than DidExit: the band is back before the traffic lights return.
export function watchFullscreen(): () => void {
  Window.IsFullscreen()
    .then((on) => useFullscreen.setState({ on }))
    .catch(() => {})
  const offs = [
    Events.On(Events.Types.Mac.WindowDidEnterFullScreen, () => useFullscreen.setState({ on: true })),
    Events.On(Events.Types.Mac.WindowWillExitFullScreen, () => useFullscreen.setState({ on: false })),
  ]
  return () => offs.forEach((off) => off())
}
