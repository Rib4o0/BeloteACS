import type { Action, PublicMatch, Rng } from "./game/index.ts";

/**
 * Picks a uniformly random legal action. Returns null when the viewer has no
 * legal action (not their turn, the game is over, or they are a spectator).
 */
export function chooseAction(
  view: PublicMatch,
  rng: Rng = Math.random,
): Action | null {
  if (view.legal.length === 0) {
    return null;
  }

  const index = Math.min(
    view.legal.length - 1,
    Math.floor(rng() * view.legal.length),
  );
  return view.legal[index];
}
