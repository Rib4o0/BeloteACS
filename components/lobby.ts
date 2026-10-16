import type { Team } from "../server/definitions";

export const SEAT_COUNT = 4;

export type LobbyPlayer = {
  id: string;
  name: string;
  host: boolean;
  team: Team | null;
  connected: boolean;
  bot: boolean;
};

/** Returns a new player list with the given player's team set. */
export function assignTeam(
  players: LobbyPlayer[],
  playerId: string,
  team: Team,
): LobbyPlayer[] {
  return players.map((player) =>
    player.id === playerId ? { ...player, team } : player,
  );
}

/** True once exactly four players are present and all have picked a team. */
export function allTeamsPicked(players: LobbyPlayer[]): boolean {
  return (
    players.length === SEAT_COUNT && players.every((player) => player.team)
  );
}

/** Seats in join order, padded with nulls for empty seats. Never exceeds SEAT_COUNT. */
export function seatSlots(players: LobbyPlayer[]): (LobbyPlayer | null)[] {
  const slots: (LobbyPlayer | null)[] = players.slice(0, SEAT_COUNT);
  while (slots.length < SEAT_COUNT) {
    slots.push(null);
  }
  return slots;
}