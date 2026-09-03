import { useEffect, useState } from 'react'

/** Chrome/Edge/Android fire this when the app is installable. Not in lib.dom. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS predates display-mode and sets this instead.
    (navigator as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * Offers to install the app to the home screen.
 *
 * Renders nothing once installed. On Android/desktop it triggers the browser's
 * own install prompt; iOS has no such API, so it explains the Share-sheet route
 * instead of pretending the button can do it.
 */
export function InstallButton() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Suppress the browser's mini-infobar; the toolbar button replaces it.
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setInstallEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return null

  if (isIos()) {
    return (
      <button
        type="button"
        className="btn btn--soft"
        onClick={() =>
          window.alert(
            'To install: tap the Share button in Safari, then "Add to Home Screen". ' +
              'The tree then opens full screen with its own icon.',
          )
        }
      >
        Install app
      </button>
    )
  }

  if (!installEvent) return null

  return (
    <button
      type="button"
      className="btn btn--soft"
      onClick={() => {
        void installEvent.prompt()
        // The event can only be used once, whatever the user chooses.
        setInstallEvent(null)
      }}
    >
      Install app
    </button>
  )
}
