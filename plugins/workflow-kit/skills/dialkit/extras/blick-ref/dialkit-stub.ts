/**
 * Production stand-in for DialKit (vite.config.ts aliases `dialkit` to this file in builds), so
 * the ~350 KB tuning library never ships. It returns each control's default, the same values the
 * real panel starts from (the tuned values are baked into those defaults), and renders nothing.
 */
type Config = Record<string, unknown>

function defaults(config: Config): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, c] of Object.entries(config)) {
    if (Array.isArray(c)) out[key] = c[0] // slider: [default, min, max, step]
    else if (c && typeof c === 'object') {
      const t = (c as { type?: string }).type
      if (t === 'easing' || t === 'spring' || t === 'transition') out[key] = c
      else if (t === 'select') out[key] = (c as { default?: unknown; options: unknown[] }).default ?? firstOption((c as { options: unknown[] }).options)
      else if (t === 'action') continue
      else if (t) out[key] = (c as { default?: unknown }).default
      else out[key] = defaults(c as Config) // folder
    } else out[key] = c // toggle (boolean), plain number or string
  }
  return out
}

const firstOption = (options: unknown[]) => {
  const o = options[0]
  return o && typeof o === 'object' ? (o as { value: unknown }).value : o
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDialKitController(_name: string, config: Config, _options?: unknown): any {
  const values = defaults(config)
  return { values, getValues: () => values }
}

export function DialRoot() {
  return null
}
