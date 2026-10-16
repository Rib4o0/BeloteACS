import { publicState, type PublicMatch } from "../game/index.ts";
import type { Player, Room, Team } from "../definitions.ts";
import { HEARTBEAT_TIMEOUT_MS } from "./constants.ts";

export type RoomPlayer = {
  id: string;
  name: string;
  team: Team | null;
  host: boolean;
  connected: boolean;
  bot: boolean;
};

export type RoomView = {
  playing: boolean;
  players: RoomPlayer[];
  you: string | null;
  match: PublicMatch | null;
};

/**
 * Maps the four rostered players to engine seats: team A occupies seats 0 and
 * 2, team B seats 1 and 3, each in join order. Partners are always opposite.
 */
export function seatPlayers(
  players: Player[],
): [string, string, string, string] {
  const teamA = players.filter((player) => player.team === "A").map((p) => p.id);
  const teamB = players.filter((player) => player.team === "B").map((p) => p.id);

  return [teamA[0], teamB[0], teamA[1], teamB[1]];
}

/** Builds the per-viewer state sent over the stream and rendered by the page. */
export function buildRoomView(room: Room, playerId: string | null): RoomView {
  const now = Date.now();
  const member =
    playerId !== null && room.game.players.some((player) => player.id === playerId);

  const players: RoomPlayer[] = room.game.players.map((player) => ({
    id: player.id,
    name: player.name,
    team: player.team ?? null,
    host: player.host,
    connected:
      player.bot === true ||
      !room.game.playing ||
      now - (player.lastSeen ?? 0) <= HEARTBEAT_TIMEOUT_MS,
    bot: player.bot === true,
  }));

  return {
    playing: room.game.playing,
    players,
    you: member ? playerId : null,
    match: room.match ? publicState(room.match, playerId ?? "") : null,
  };
}
