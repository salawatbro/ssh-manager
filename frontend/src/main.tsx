import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/tokens.css'
import App from './App'

// This is a desktop app, not a web page: the browser's default right-click
// menu (Reload/Inspect, …) has no place here. Suppress it everywhere except
// editable fields, which keep the native Cut/Copy/Paste menu. Components that
// want their own menu read the event in their onContextMenu and open it; this
// listener only cancels the browser default.
document.addEventListener('contextmenu', (e) => {
  const el = e.target as HTMLElement | null
  if (el?.closest('input, textarea, [contenteditable="true"], .selectable')) return
  e.preventDefault()
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
