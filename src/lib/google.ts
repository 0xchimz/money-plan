export interface GoogleId {
  initialize(options: { client_id: string; callback: (response: { credential: string }) => void; ux_mode?: 'popup' | 'redirect'; auto_select?: boolean }): void
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void
  disableAutoSelect(): void
}

declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

const SRC = 'https://accounts.google.com/gsi/client'
let loading: Promise<GoogleId> | null = null

/** Google Identity Services, loaded once (only the login page needs it) */
export function loadGoogle(): Promise<GoogleId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id)
  return (loading ??= new Promise<GoogleId>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('โหลดปุ่ม Google ไม่ได้')))
    s.onerror = () => {
      loading = null
      reject(new Error('โหลดปุ่ม Google ไม่ได้'))
    }
    document.head.appendChild(s)
  }))
}
