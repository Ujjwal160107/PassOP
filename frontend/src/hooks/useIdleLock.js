import { useEffect, useRef } from 'react'

const CHECK_EVERY_MS = 15_000

// Calls onIdle after `ms` without pointer or keyboard input. Checks elapsed time on an interval
// (and when the tab becomes visible) because browsers throttle timers in background tabs.
export default function useIdleLock(onIdle, ms, enabled = true) {
  const lastActive = useRef(0)
  const onIdleRef = useRef(onIdle)

  useEffect(() => {
    onIdleRef.current = onIdle
  }, [onIdle])

  useEffect(() => {
    if (!enabled) return
    lastActive.current = Date.now()
    const touch = () => { lastActive.current = Date.now() }
    const check = () => {
      if (Date.now() - lastActive.current >= ms) onIdleRef.current()
    }
    const onVisible = () => document.visibilityState === 'visible' && check()

    window.addEventListener('pointerdown', touch)
    window.addEventListener('keydown', touch)
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(check, CHECK_EVERY_MS)
    return () => {
      window.removeEventListener('pointerdown', touch)
      window.removeEventListener('keydown', touch)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [ms, enabled])
}
