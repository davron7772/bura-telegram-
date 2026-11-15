// Telegram versiyasidagi qoidalar dvigateli va stol — bir xil kod (../../src).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Engine = require('../../../src/engine');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RoomModule = require('../../../src/room');

export type Card = string; // masalan 'AS', '10H', 'KD'
export type Suit = 'S' | 'H' | 'D' | 'C';

export interface Play { seat: number; up: boolean; n: number; cards: Card[] | null }
export interface TrickView { k: number; best: number; winner: number; plays: Play[] }
export interface ResultView {
  type: 'win' | 'draw' | 'aces';
  seat: number;
  team: number;
  points: [number, number];
  award: number;
  score: [number, number];
  loser: number;
  matchOver: boolean;
  matchLoser: number;
  matchWinner: number;
  round: number;
  nextBonus: number;
}
export interface GameView {
  n: number;
  me: number;
  trump: Suit;
  firstTrump: Suit;
  trumpCard: Card;
  trumpInStock: boolean;
  hiddenInStock: boolean;
  hiddenCard: Card | null;
  stock: number;
  phase: 'lead' | 'follow' | 'trickEnd' | 'roundEnd';
  leader: number;
  turn: number;
  hand: Card[] | null;
  counts: number[];
  trick: TrickView | null;
  teamKnown?: number;
  teamHidden?: number;
  teamCards?: number;
}
export interface SeatView { name: string; bot: boolean; team: number; you: boolean }
export interface GameEvent {
  kind: string;
  seat: number;
  k?: number;
  count?: number;
  card?: Card;
  from?: Suit;
  to?: Suit;
  team?: number;
  points?: number[];
  round?: number;
  auto?: boolean;
  via?: string;
  seq: number;
  also?: GameEvent[];
}
export interface RoomSnapshot {
  phase: 'lobby' | 'playing' | 'roundEnd';
  round: number;
  mySeat: number;
  myTeam: number;
  seats: (SeatView | null)[];
  score: [number, number];
  lose: number;
  edge: number;
  matchOver: boolean;
  game: GameView | null;
  event: GameEvent | null;
  result: ResultView | null;
  deadlineIn: number;
  deadlineTotal: number;
}

export interface LocalRoom {
  connect(user: { id: string; name: string }): void;
  dispatch(uid: string, msg: Record<string, unknown>): string | null;
  snapshot(uid: string): RoomSnapshot;
  destroy(): void;
}

export const E = Engine as {
  suitOf(c: Card): Suit;
  rankOf(c: Card): string;
  teamOf(seat: number): number;
  sortHand(hand: Card[], trump: Suit): Card[];
  isValidLead(cards: Card[]): boolean;
  setBeats(def: Card[], att: Card[], trump: Suit): boolean;
  MATCH_LOSE: number;
  MATCH_EDGE: number;
};

export function createLocalRoom(onChange: () => void): LocalRoom {
  return new RoomModule.Room({ id: 'local', turnSeconds: 45, botDelay: [750, 1300], onChange }) as LocalRoom;
}

// Kartadagi yozuv: tuz — "T" (Telegram versiyasidagidek)
export const rankLabel = (c: Card) => {
  const r = E.rankOf(c);
  return r === 'A' ? 'T' : r;
};
export const isRed = (c: Card | Suit) => {
  const s = c.length === 1 ? c : E.suitOf(c);
  return s === 'H' || s === 'D';
};
