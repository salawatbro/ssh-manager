import { useEffect, type RefObject } from 'react'
import { TrayPanelService } from '@bindings/github.com/salawat/sshmgr'
import { fitHeight } from '../lib/trayPanel'

// Keeps the panel window as tall as its page. `viewport` scrolls `content`
// once the window reaches its tallest; `frame` is everything.
export function usePanelFit(
  frame: RefObject<HTMLElement | null>,
  viewport: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    let sent = 0
    const measure = () => {
      const f = frame.current
      const v = viewport.current
      const c = content.current
      if (!f || !v || !c) return
      const h = fitHeight(f.offsetHeight, v.clientHeight, c.offsetHeight)
      if (h === sent) return
      sent = h
      void TrayPanelService.Fit(h)
    }
    const observer = new ResizeObserver(measure)
    for (const el of [frame.current, viewport.current, content.current]) if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [frame, viewport, content])
}
