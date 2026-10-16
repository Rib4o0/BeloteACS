export type Card = {
  suit: string;
  rank: number;
};

export type Team = "A" | "B";

export type Player = {
  id: string;
  name: string;
  host: boolean;
  team?: Team;
  cards: Card[];
  lastSeen?: number;
};

export type Game = {
  playing: boolean;
  players: Player[];
};

export type Room = {
  code: string;
  game: Game;
};
