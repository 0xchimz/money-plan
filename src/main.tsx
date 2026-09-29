import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from '@/App'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import './index.css'

// Warm "personal finance" tone on every page; dark follows the OS (dark values are their own validated steps)
document.documentElement.classList.add('finance')
const media = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => document.documentElement.classList.toggle('dark', media.matches)
applyTheme()
media.addEventListener('change', applyTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  </StrictMode>,
)
