import { CONTRACTS, isStronger, type Contract } from "./contracts.ts";
import { nextSeat, type BiddingHand, type Seat } from "./types.ts";

/** Contracts a player may legally bid (pass is always available separately). */
export function legalBids(hand: BiddingHand): Contract[] {
  return CONTRACTS.filter((contract) => !hand.top || isStronger(contract, hand.top));
}

export function placeBid(hand: BiddingHand, seat: Seat, contract: Contract): BiddingHand {
  return {
    ...hand,
    top: contract,
    topBidder: seat,
    passesInARow: 0,
    turn: nextSeat(seat),
  };
}

export function passBid(hand: BiddingHand, seat: Seat): BiddingHand {
  return {
    ...hand,
    passesInARow: hand.passesInARow + 1,
    turn: nextSeat(seat),
  };
}

export type BiddingResult = { taker: Seat; contract: Contract } | "redeal" | null;

/** Whether the auction is finished, and with what outcome. */
export function biddingResult(hand: BiddingHand): BiddingResult {
  if (hand.top && hand.passesInARow >= 3) {
    return { taker: hand.topBidder as Seat, contract: hand.top };
  }

  if (!hand.top && hand.passesInARow >= 4) {
    return "redeal";
  }

  return null;
}
