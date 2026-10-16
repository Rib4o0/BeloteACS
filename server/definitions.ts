import type { Match, Rng } from "./game/index.ts";

export type Team = "A" | "B";

export type Player = {
  id: string;
  name: string;
  host: boolean;
  team?: Team;
  lastSeen?: number;
  /** A server-controlled player with no connection. */
  bot?: boolean;
};

export type Game = {
  playing: boolean;
  players: Player[];
};

export type Room = {
  code: string;
  /** The live match once the game has started; null in the lobby. */
  match: Match | null;
  /** Persistent rng so every deal in the match is deterministic and distinct. */
  rng: Rng;
  game: Game;
};
