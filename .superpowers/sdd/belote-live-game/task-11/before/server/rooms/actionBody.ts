import type { Action, Card, Contract } from "../game/index.ts";

const SUITS = ["clubs", "diamonds", "hearts", "spades"];
const RANKS = ["7", "8", "9", "10", "J", "Q", "K", "A"];

function isCard(value: unknown): value is Card {
  if (!value || typeof value !== "object") return false;
  const card = value as Record<string, unknown>;
  return (
    typeof card.suit === "string" &&
    SUITS.includes(card.suit) &&
    typeof card.rank === "string" &&
    RANKS.includes(card.rank)
  );
}

function isContract(value: unknown): value is Contract {
  if (!value || typeof value !== "object") return false;
  const contract = value as Record<string, unknown>;

  if (contract.kind === "nt" || contract.kind === "at") return true;
  return contract.kind === "suit" && typeof contract.suit === "string" && SUITS.includes(contract.suit);
}

/**
 * Turns an untrusted request body into an engine Action, always attributing it
 * to `playerId` (the authenticated cookie), never to any id in the body.
 */
export function parseAction(raw: unknown, playerId: string): Action | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;

  if (body.kind === "pass") {
    return { kind: "pass", playerId };
  }
  if (body.kind === "play" && isCard(body.card)) {
    return { kind: "play", playerId, card: body.card };
  }
  if (body.kind === "bid" && isContract(body.contract)) {
    return { kind: "bid", playerId, contract: body.contract };
  }

  return null;
}
