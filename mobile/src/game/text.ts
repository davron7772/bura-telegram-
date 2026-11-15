import { E, rankLabel, type GameEvent, type RoomSnapshot, type Suit } from './engine';
import { teamName } from '@/theme';

const SUIT_CHAR: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const suitChar = (s: Suit) => SUIT_CHAR[s];
const cardText = (c?: string) => (c ? rankLabel(c) + SUIT_CHAR[E.suitOf(c)] : '');

export function seatName(r: RoomSnapshot, seat: number) {
  if (seat === r.mySeat) return 'Siz';
  return r.seats[seat]?.name ?? `${seat + 1}-o‘rin`;
}

/** Telegram versiyasidagi hodisa matnlari bilan bir xil */
export function eventLine(r: RoomSnapshot, ev: GameEvent): string {
  const you = ev.seat === r.mySeat;
  const nm = seatName(r, ev.seat);
  const v = (third: string, second: string) => `${nm} ${you ? second : third}`;
  switch (ev.kind) {
    case 'deal':
      return `${ev.round}-raund. ${you ? 'Siz birinchi yurasiz' : `${nm} birinchi yuradi`}. Ko‘zir: ${r.game ? suitChar(r.game.firstTrump) : ''}`;
    case 'lead':
      return ev.k && ev.k > 1 ? v(`${ev.k} ta karta bilan yurdi`, `${ev.k} ta karta bilan yurdingiz`) : v('yurdi', 'yurdingiz');
    case 'bura':
      return `Bura! ${v('navbatsiz yurdi', 'navbatsiz yurdingiz')}`;
    case 'beat':
      return v('urdi', 'urdingiz');
    case 'discard':
      return v('yopiq berdi', 'yopiq berdingiz');
    case 'collect':
      return v(`${ev.count} ta kartani oldi`, `${ev.count} ta kartani oldingiz`);
    case 'reveal':
      return (
        v('yopiq kartani oldi: ', 'yopiq kartani oldingiz: ') +
        cardText(ev.card) +
        (ev.from !== ev.to && ev.to ? `. Ko‘zir endi ${suitChar(ev.to)}` : '. Ko‘zir o‘zgarmadi')
      );
    case 'win':
      return `${teamName(ev.team ?? 0)} yutdi: ${ev.points?.[ev.team ?? 0] ?? 0} ochko`;
    case 'aces':
      return `4 ta tuz! ${v('mutlaq yutdi', 'mutlaq yutdingiz')}`;
    case 'draw':
      return '60:60 — durang';
  }
  return '';
}

export function eventText(r: RoomSnapshot): string {
  const ev = r.event;
  if (!ev) return '';
  let t = eventLine(r, ev);
  if (ev.auto) t += ' (vaqt tugadi)';
  for (const e of ev.also ?? []) if (e.kind === 'reveal' || e.kind === 'bura') t += ` · ${eventLine(r, e)}`;
  return t;
}
