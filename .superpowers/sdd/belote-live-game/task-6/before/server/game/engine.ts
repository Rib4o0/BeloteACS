import { newDeck, shuffle, sameCard, type Card } from "./cards.ts";
import { bidStrength, type Contract } from "./contracts.ts";
import { biddingResult, legalBids, passBid, placeBid } from "./bidding.ts";
import { legalPlays, reducePlay } from "./playing.ts";
import { gameWinner, scoreHand, type HandOutcome } from "./scoring.ts";
import type { Rng } from "./rng.ts";
import {
  nextSeat,
  SEATS,
  type Action,
  type ActionResult,
  type BiddingHand,
  type Match,
  type Play,
  type PlayingHand,
  type PlayerId,
  type Seat,
  type Team,
} from "./types.ts";

/** Deals `rounds` single cards to each player, starting after the dealer. */
function dealRounds(
  deck: readonly Card[],
  start: number,
  dealer: Seat,
  rounds: number,
): { hands: Card[][]; nextIndex: number } {
  const hands: Card[][] = [[], [], [], []];
  let index = start;

  for (let round = 0; round < rounds; round++) {
    for (let step = 1; step <= 4; step++) {
      hands[((dealer + step) % 4) as Seat].push(deck[index]);
      index += 1;
    }
  }

  return { hands, nextIndex: index };
}

function toRecord(arrays: Card[][]): Record<Seat, Card[]> {
  return { 0: arrays[0], 1: arrays[1], 2: arrays[2], 3: arrays[3] };
}

/** Shuffles and deals a fresh hand in its bidding phase (5 cards + 3 reserve). */
function dealBidding(dealer: Seat, rng: Rng): BiddingHand {
  const deck = shuffle(newDeck(), rng);
  const first = dealRounds(deck, 0, dealer, 3);
  const second = dealRounds(deck, first.nextIndex, dealer, 2);
  const reserve = dealRounds(deck, second.nextIndex, dealer, 3);

  const hands = toRecord(
    SEATS.map((seat) => [...first.hands[seat], ...second.hands[seat]]),
  );

  return {
    phase: "bidding",
    dealer,
    turn: nextSeat(dealer),
    hands,
    rest: toRecord(reserve.hands),
    top: null,
    topBidder: null,
    passesInARow: 0,
  };
}

/** Deals the reserve and moves the settled auction into trick play. */
function startPlaying(bidding: BiddingHand, taker: Seat, contract: Contract): PlayingHand {
  return {
    phase: "playing",
    dealer: bidding.dealer,
    turn: nextSeat(bidding.dealer),
    hands: toRecord(
      SEATS.map((seat) => [...bidding.hands[seat], ...bidding.rest[seat]]),
    ),
    contract,
    taker,
    trick: [],
    tricks: [],
  };
}

/** Runs the automatic transitions after an action. */
function settle(match: Match, rng: Rng): Match {
  if (match.winner) {
    return match;
  }

  const hand = match.hand;

  if (hand.phase === "bidding") {
    const result = biddingResult(hand);

    if (result === "redeal") {
      return { ...match, hand: dealBidding(hand.dealer, rng) };
    }

    if (result) {
      return { ...match, hand: startPlaying(hand, result.taker, result.contract) };
    }

    return match;
  }

  if (hand.tricks.length !== 8) {
    return match;
  }

  const outcome = scoreHand(hand.tricks, hand.contract, hand.taker);
  const scores = {
    A: match.scores.A + outcome.gamePoints.A,
    B: match.scores.B + outcome.gamePoints.B,
  };
  const winner = outcome.capot ? null : (gameWinner(scores) ?? null);

  if (winner) {
    return { ...match, scores, winner, lastOutcome: outcome };
  }

  const dealer = nextSeat(hand.dealer);

  return {
    ...match,
    scores,
    handNumber: match.handNumber + 1,
    dealer,
    lastOutcome: outcome,
    hand: dealBidding(dealer, rng),
  };
}

function seatOf(match: Match, playerId: PlayerId): Seat | null {
  const index = match.seats.indexOf(playerId);
  return index === -1 ? null : (index as Seat);
}

export function createMatch(
  players: [PlayerId, PlayerId, PlayerId, PlayerId],
  rng: Rng,
  firstDealer: Seat = 0,
): Match {
  return {
    seats: players,
    scores: { A: 0, B: 0 },
    handNumber: 1,
    dealer: firstDealer,
    winner: null,
    lastOutcome: null,
    hand: dealBidding(firstDealer, rng),
  };
}

/** Applies an action and settles, or returns the unchanged match with a reason. */
export function applyAction(match: Match, action: Action, rng: Rng): ActionResult {
  if (match.winner) {
    return { match, error: "game_over" };
  }

  const seat = seatOf(match, action.playerId);

  if (seat === null) {
    return { match, error: "not_a_player" };
  }

  const hand = match.hand;

  if (action.kind === "bid" || action.kind === "pass") {
    if (hand.phase !== "bidding") {
      return { match, error: "wrong_phase" };
    }

    if (hand.turn !== seat) {
      return { match, error: "not_your_turn" };
    }

    if (action.kind === "bid") {
      const legal = legalBids(hand).some(
        (contract) => bidStrength(contract) === bidStrength(action.contract),
      );

      if (!legal) {
        return { match, error: "bid_too_weak" };
      }

      return { match: settle({ ...match, hand: placeBid(hand, seat, action.contract) }, rng) };
    }

    return { match: settle({ ...match, hand: passBid(hand, seat) }, rng) };
  }

  if (hand.phase !== "playing") {
    return { match, error: "wrong_phase" };
  }

  if (hand.turn !== seat) {
    return { match, error: "not_your_turn" };
  }

  if (!hand.hands[seat].some((held) => sameCard(held, action.card))) {
    return { match, error: "card_not_held" };
  }

  if (!legalPlays(hand, seat).some((card) => sameCard(card, action.card))) {
    return { match, error: "card_not_legal" };
  }

  return { match: settle({ ...match, hand: reducePlay(hand, seat, action.card) }, rng) };
}

/** The actions a player may take right now (empty when it is not their turn). */
export function legalActions(match: Match, playerId: PlayerId): Action[] {
  if (match.winner) {
    return [];
  }

  const seat = seatOf(match, playerId);

  if (seat === null) {
    return [];
  }

  const hand = match.hand;

  if (hand.turn !== seat) {
    return [];
  }

  if (hand.phase === "bidding") {
    return [
      ...legalBids(hand).map((contract): Action => ({ kind: "bid", playerId, contract })),
      { kind: "pass", playerId },
    ];
  }

  return legalPlays(hand, seat).map((card): Action => ({ kind: "play", playerId, card }));
}

/** The slice of a hand that is safe to send to a viewer. */
export type PublicHand = {
  phase: "bidding" | "playing";
  dealer: Seat;
  turn: Seat;
  top: Contract | null;
  topBidder: Seat | null;
  contract: Contract | null;
  taker: Seat | null;
  /** The current, incomplete trick. */
  trick: Play[];
  /** How many tricks have been completed this hand. */
  tricksPlayed: number;
  /** How many cards each seat still holds (never which ones). */
  cardsLeft: Record<Seat, number>;
  /** The viewer's own cards; empty for spectators. */
  hand: Card[];
};

/** Everything a single viewer may see of a match. */
export type PublicMatch = {
  seats: [PlayerId, PlayerId, PlayerId, PlayerId];
  scores: Record<Team, number>;
  handNumber: number;
  dealer: Seat;
  winner: Team | null;
  lastOutcome: HandOutcome | null;
  /** The viewer's seat, or null for a spectator. */
  you: Seat | null;
  hand: PublicHand;
  /** The actions this viewer may take right now. */
  legal: Action[];
};

/** Builds the per-viewer view of a match, hiding every other player's cards. */
export function publicState(match: Match, viewerId: PlayerId): PublicMatch {
  const seat = seatOf(match, viewerId);
  const hand = match.hand;

  const cardsLeft = { 0: 0, 1: 0, 2: 0, 3: 0 } as Record<Seat, number>;
  for (const held of SEATS) {
    cardsLeft[held] = hand.hands[held].length;
  }

  const viewerCards = seat === null ? [] : hand.hands[seat];

  const publicHand: PublicHand =
    hand.phase === "bidding"
      ? {
          phase: "bidding",
          dealer: hand.dealer,
          turn: hand.turn,
          top: hand.top,
          topBidder: hand.topBidder,
          contract: null,
          taker: null,
          trick: [],
          tricksPlayed: 0,
          cardsLeft,
          hand: viewerCards,
        }
      : {
          phase: "playing",
          dealer: hand.dealer,
          turn: hand.turn,
          top: null,
          topBidder: null,
          contract: hand.contract,
          taker: hand.taker,
          trick: hand.trick,
          tricksPlayed: hand.tricks.length,
          cardsLeft,
          hand: viewerCards,
        };

  return {
    seats: match.seats,
    scores: match.scores,
    handNumber: match.handNumber,
    dealer: match.dealer,
    winner: match.winner,
    lastOutcome: match.lastOutcome,
    you: seat,
    hand: publicHand,
    legal: legalActions(match, viewerId),
  };
}
