import { create } from 'zustand'

interface TourState {
  open: boolean
  show: () => void
  close: () => void
}

// Visibility of the first-run welcome tour. App opens it once on first run
// (Settings.tourSeen === false); the ⌘K "Welcome tour" command reopens it.
export const useTour = create<TourState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
}))
