import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Polyfills for Stellar Wallets Kit (browser compatibility)
import { Buffer } from 'buffer'
window.Buffer = Buffer
window.global = window

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
