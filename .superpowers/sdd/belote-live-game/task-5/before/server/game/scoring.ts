import type { Contract } from "./contracts.ts";
import { trickWinner } from "./rules.ts";
import { teamOf, type Seat, type Team, type Trick } from "./types.ts";
import { dixDeDer, trickPoints } from "./values.ts";

/** Raw value of a hand where one team takes every trick. */
export const CAPOT = 350;

/** First team to reach this game score wins. */
export const TARGET = 151;

export type HandOutcome = {
  /** Raw hand points per team, before the ÷10 conversion. */
  raw: Record<Team, number>;
  /** Game points gained this hand (raw ÷10, rounded). */
  gamePoints: Record<Team, number>;
  /** True when the taker finished strictly behind. */
  dedans: boolean;
  /** The team that took every trick, if any. */
  capot: Team | null;
  taker: Seat;
};

/** Converts raw hand points into running game points. */
export function toGamePoints(raw: number): number {
  return Math.round(raw / 10);
}

function opponent(team: Team): Team {
  return team === "A" ? "B" : "A";
}

/**
 * Scores one completed hand: raw trick points with dix de der, then capot and
 * dedans, then the ÷10 conversion.
 */
export function scoreHand(
  tricks: readonly Trick[],
  contract: Contract,
  taker: Seat,
): HandOutcome {
  const raw: Record<Team, number> = { A: 0, B: 0 };
  const wins: Record<Team, number> = { A: 0, B: 0 };

  tricks.forEach((plays, index) => {
    const team = teamOf(trickWinner(plays, contract));
    let points = trickPoints(
      plays.map((played) => played.card),
      contract,
    );

    if (index === tricks.length - 1) {
      points += dixDeDer(contract);
    }

    raw[team] += points;
    wins[team] += 1;
  });

  let capot: Team | null = null;

  if (tricks.length > 0 && wins.A === tricks.length) {
    capot = "A";
  } else if (tricks.length > 0 && wins.B === tricks.length) {
    capot = "B";
  }

  if (capot) {
    raw[capot] = CAPOT;
    raw[opponent(capot)] = 0;
  }

  const takerTeam = teamOf(taker);
  let dedans = false;

  if (!capot && raw[takerTeam] < raw[opponent(takerTeam)]) {
    raw[opponent(takerTeam)] += raw[takerTeam];
    raw[takerTeam] = 0;
    dedans = true;
  }

  return {
    raw,
    gamePoints: { A: toGamePoints(raw.A), B: toGamePoints(raw.B) },
    dedans,
    capot,
    taker,
  };
}

/**
 * The winning team once a non-capot hand has been scored, or undefined while the
 * game continues.
 */
export function gameWinner(scores: Record<Team, number>): Team | undefined {
  if (Math.max(scores.A, scores.B) < TARGET) {
    return undefined;
  }

  if (scores.A === scores.B) {
    return undefined;
  }

  return scores.A > scores.B ? "A" : "B";
}
