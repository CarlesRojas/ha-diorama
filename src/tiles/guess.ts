import type { EntityState } from '#/types.ts'
import { useEffect, useState } from 'react'

// How long a tap's guess stands with no word from Home Assistant before the
// tile goes back to what the entity says. The 3D pieces wait as long.
export const GUESS_MS = 2500

type Guess<T> = { value: T; state: string | undefined }

// What a tap says the entity is about to be, shown at once. A light on a
// cloud account or a Zigbee switch can take a second or more to report,
// and until it did the tile sat still under the finger, as if the tap had
// not landed. The guess stands until the entity says the same, changes its
// state some other way, or the wait runs out, the way Home Assistant's own
// toggles flip at once and fall back when nothing confirms them.
export function useGuess<T>(real: T, entity: EntityState | undefined): [T, (value: T) => void] {
  const [guess, setGuess] = useState<Guess<T> | null>(null)
  // Dropped as soon as the entity agrees, or moves on to a state other than
  // the one it had when the tap was made.
  if (guess && (Object.is(guess.value, real) || entity?.state !== guess.state)) setGuess(null)
  useEffect(() => {
    if (!guess) return
    const timer = setTimeout(() => setGuess(null), GUESS_MS)
    return () => clearTimeout(timer)
  }, [guess])
  return [guess ? guess.value : real, value => setGuess({ value, state: entity?.state })]
}
