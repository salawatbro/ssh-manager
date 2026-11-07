export type MenuAlign = 'start' | 'end'

const MARGIN = 4

// Where a w×h menu opens for (x, y): 'end' puts its right edge at x (a
// button's right edge). It never spills past the viewport.
export function placeMenu(x: number, y: number, w: number, h: number, vw: number, vh: number, align: MenuAlign = 'start') {
  const left = align === 'end' ? x - w : x
  return {
    left: Math.max(MARGIN, Math.min(left, vw - w - MARGIN)),
    top: Math.max(MARGIN, Math.min(y, vh - h - MARGIN)),
  }
}
