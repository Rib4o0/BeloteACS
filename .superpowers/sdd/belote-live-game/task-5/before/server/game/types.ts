import type { Card } from "./cards.ts";
import type { Contract } from "./contracts.ts";
import type { HandOutcome } from "./scoring.ts";

/** Seat index around the table, counter-clockwise. Teams are 0 & 2 vs 1 & 3. */
export type Seat = 0 | 1 | 2 | 3;

export type Team = "A" | "B";

export type PlayerId = string;

/** One card played into the current trick. */
export type Play = { seat: Seat; card: Card };

/** A completed trick: the plays, in the order they were made. */
export type Trick = readonly Play[];

export const SEATS: Seat[] = [0, 1, 2, 3];
export const TEAMS: Team[] = ["A", "B"];

/** Team membership is fixed: seats 0 & 2 are A, seats 1 & 3 are B. */
export function teamOf(seat: Seat): Team {
  return seat % 2 === 0 ? "A" : "B";
}

/** The two seats that make up a team. */
export function seatsOf(team: Team): [Seat, Seat] {
  return team === "A" ? [0, 2] : [1, 3];
}

/** The next seat counter-clockwise. */
export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

/** The same team's other seat. */
export function partnerSeat(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}

/** A hand during the climbing auction. */
export type BiddingHand = {
  phase: "bidding";
  dealer: Seat;
  turn: Seat;
  /** The five cards each player holds during the auction. */
  hands: Record<Seat, Card[]>;
  /** The three cards each player is dealt once the contract is settled. */
  rest: Record<Seat, Card[]>;
  top: Contract | null;
  topBidder: Seat | null;
  passesInARow: number;
};

/** A hand in trick play. */
export type PlayingHand = {
  phase: "playing";
  dealer: Seat;
  turn: Seat;
  hands: Record<Seat, Card[]>;
  contract: Contract;
  taker: Seat;
  trick: Play[];
  tricks: Trick[];
};

export type Hand = BiddingHand | PlayingHand;

export type Match = {
  seats: [PlayerId, PlayerId, PlayerId, PlayerId];
  scores: Record<Team, number>;
  handNumber: number;
  dealer: Seat;
  winner: Team | null;
  lastOutcome: HandOutcome | null;
  hand: Hand;
};

export type Action =
  | { kind: "bid"; playerId: PlayerId; contract: Contract }
  | { kind: "pass"; playerId: PlayerId }
  | { kind: "play"; playerId: PlayerId; card: Card };

export type Reason =
  | "not_a_player"
  | "not_your_turn"
  | "wrong_phase"
  | "bid_too_weak"
  | "card_not_held"
  | "card_not_legal"
  | "game_over";

export type ActionResult = { match: Match; error?: Reason };
