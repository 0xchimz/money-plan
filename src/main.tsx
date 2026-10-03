import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from '@/App'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useIsMobile } from '@/lib/use-is-mobile'
import './index.css'

// Warm "personal finance" tone on every page; dark follows the OS (dark values are their own validated steps)
document.documentElement.classList.add('finance')
const media = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => document.documentElement.classList.toggle('dark', media.matches)
applyTheme()
media.addEventListener('change', applyTheme)

/** Phones get toasts at the top so they never cover the tab bar or a sheet's buttons */
function AppToaster() {
  const mobile = useIsMobile()
  return <Toaster position={mobile ? 'top-center' : 'bottom-right'} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <AppToaster />
    </TooltipProvider>
  </StrictMode>,
)
