import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import '../styles/tokens.css'
import { startTheme } from '../lib/themeSync'
import { ApprovalApp } from './ApprovalApp'

document.addEventListener('contextmenu', (e) => e.preventDefault())

startTheme()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ApprovalApp />
  </React.StrictMode>,
)
