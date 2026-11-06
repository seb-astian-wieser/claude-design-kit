import { useEffect, useRef, useState } from 'react'
import { inPhoneFrame, sendToPhoneFrame } from './phoneFrame'

// Saves a DialKit panel's values to dial-values.json (dev-only Vite endpoint in dial-values.plugin.js)
// and restores them on load, so tuning survives reloads. Port of the vanilla dial-autosave helper.
type Controller = { getValues: () => unknown; setValues: (v: never) => void }

function stripActions(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>
      if (o.type === 'action') continue
      out[k] = o.type ? o : stripActions(o)
    } else out[k] = v
  }
  return out
}

/** Returns whether the saved values are back (always true in production, where nothing is saved). */
export function useDialAutosave(name: string, controller: Controller, values: unknown, route = '/__dial-values') {
  const ready = useRef(false)
  const [restored, setRestored] = useState(!import.meta.env.DEV)
  const ctrl = useRef(controller)
  ctrl.current = controller

  useEffect(() => {
    if (!import.meta.env.DEV) return // the endpoint only exists on the dev server
    const w = window as unknown as { __dial?: Record<string, () => unknown> }
    w.__dial = w.__dial || {}
    w.__dial[name] = () => structuredClone(ctrl.current.getValues())
    let cancelled = false
    fetch(route)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (cancelled) return
        const saved = data?.panels?.[name]
        if (saved) ctrl.current.setValues(saved as never)
        setRestored(true)
        // Only start saving once the endpoint answered, so a failed load never overwrites saved values.
        // The phone frame's copy never saves: the outer page's panel is the one being tuned.
        if (!inPhoneFrame) setTimeout(() => (ready.current = true), 50)
      })
      .catch(() => setRestored(true))
    return () => {
      cancelled = true
    }
  }, [name, route])

  // Phone frame (DialKit → Loading → Set to mobile): the framed copy takes the outer panel's values live.
  useEffect(() => {
    if (!import.meta.env.DEV || !inPhoneFrame) return
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'blick-dial' || e.data.name !== name) return
      ctrl.current.setValues(e.data.values as never)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [name])

  const serialized = JSON.stringify(values)
  useEffect(() => {
    if (import.meta.env.DEV && !inPhoneFrame) sendToPhoneFrame(name, stripActions(JSON.parse(serialized)))
  }, [serialized, name])
  useEffect(() => {
    if (!ready.current) return
    const t = setTimeout(() => {
      fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, values: stripActions(JSON.parse(serialized)) }),
      }).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [serialized, name, route])
  return restored
}
