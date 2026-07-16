import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Root from './Root.tsx'

declare global {
  interface Window {
    __riceCarbonFootprintRoot?: ReturnType<typeof createRoot>
  }
}

const container = document.getElementById('root')!
const root =
  window.__riceCarbonFootprintRoot ?? createRoot(container)

window.__riceCarbonFootprintRoot = root

root.render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
