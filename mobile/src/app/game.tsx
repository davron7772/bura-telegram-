import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { Avatar, Background, GoldButton, Icon, IconButton, ICONS, Pill, PillText, tap } from '@/components/ui';
import { CardBack, PlayingCard, cardHeight } from '@/components/PlayingCard';
import { Suit } from '@/components/Suit';
import { ResultOverlay } from '@/components/ResultOverlay';
import { useGame } from '@/game/store';
import { E, type Card, type GameView, type Play, type RoomSnapshot } from '@/game/engine';
import { eventText, seatName } from '@/game/text';
import { C, F, teamColor } from '@/theme';

type Side = 'bottom' | 'left' | 'top' | 'right';

/** O'yinchining stoldagi joyi: navbat siz → chap → ro'para (sherik) → o'ng */
function sideOf(seat: number, me: number): Side {
  const d = (seat - Math.max(me, 0) + 4) % 4;
  return (['bottom', 'left', 'top', 'right'] as const)[d];
}
const actorOf = (g: GameView) => (g.phase === 'lead' ? g.leader : g.phase === 'follow' ? g.turn : -1);

export default function GameScreen() {
  const insets = useSafeAreaInsets();
  const { snap, send, leave, error, clearError, startWithBots } = useGame();
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!snap) router.replace('/');
  }, [snap]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 2200);
    return () => clearTimeout(t);
  }, [error, clearError]);

  if (!snap) return <Background />;
  const g = snap.game;

  const goHome = () => {
    leave();
    router.replace('/');
  };

  return (
    <Background style={{ paddingTop: insets.top }}>
      <Hud snap={snap} onMenu={goHome} />
      <View style={{ flex: 1 }} onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {size.w > 0 && g && <Table snap={snap} g={g} w={size.w} h={size.h} />}
        {snap.phase === 'lobby' && (
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontFamily: F.semibold, color: C.muted }}>Karta tarqatilmoqda…</Text>
          </View>
        )}
      </View>
      {g && <Hand snap={snap} g={g} send={send} bottomInset={insets.bottom} />}
      {error && (
        <View style={styles.error} pointerEvents="none">
          <Text style={{ fontFamily: F.semibold, color: C.text, fontSize: 13, textAlign: 'center' }}>{error}</Text>
        </View>
      )}
      {snap.phase === 'roundEnd' && snap.result && (
        <ResultOverlay
          snap={snap}
          onNext={() => {
            if (!send({ t: 'next' })) startWithBots();
          }}
          onHome={goHome}
        />
      )}
    </Background>
  );
}

function Hud({ snap, onMenu }: { snap: RoomSnapshot; onMenu: () => void }) {
  return (
    <View style={styles.hud}>
      <ScoreBox team={0} value={snap.score[0]} mine={snap.myTeam === 0} edge={snap.edge} />
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontFamily: F.extrabold, fontSize: 11, letterSpacing: 1.3, color: C.gold }}>{snap.lose} BALLGACHA</Text>
        <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.muted }}>{snap.round}-raund</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ScoreBox team={1} value={snap.score[1]} mine={snap.myTeam === 1} edge={snap.edge} />
        <IconButton d={ICONS.close} label="O‘yindan chiqish" onPress={onMenu} />
      </View>
    </View>
  );
}

function ScoreBox({ team, value, mine, edge }: { team: number; value: number; mine: boolean; edge: number }) {
  return (
    <View style={[styles.score, { borderColor: teamColor(team) + '99' }]} accessibilityLabel={`${team === 0 ? 'A' : 'B'} jamoa: ${value} ball`}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: teamColor(team) }} />
      <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.muted }}>{team === 0 ? 'A' : 'B'}{mine ? ' · siz' : ''}</Text>
      <Text style={{ fontFamily: F.extrabold, fontSize: 18, color: value === edge ? C.gold : teamColor(team) }}>{value}</Text>
    </View>
  );
}

const CW = 60; // stoldagi karta kengligi

function Table({ snap, g, w, h }: { snap: RoomSnapshot; g: GameView; w: number; h: number }) {
  const me = snap.mySeat;
  const actor = actorOf(g);
  const seatAt = (side: Side) => [0, 1, 2, 3].find((s) => sideOf(s, me) === side)!;
  const cx = w / 2;
  const cy = Math.max(h * 0.48, 230);
  const ch = cardHeight(CW);
  // Yurilgan kartalar o'yinchi tomoniga suriladi; pastdagisi hodisa yozuvi va kolodaga tegmaydi
  const pos: Record<Side, { x: number; y: number }> = {
    top: { x: cx, y: Math.max(cy - 92, 140 + ch / 2) },
    left: { x: cx - 72, y: cy },
    right: { x: cx + 72, y: cy },
    bottom: { x: cx, y: Math.min(cy + 88, h - 136 - ch / 2) },
  };

  const text = eventText(snap);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="felt" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#1E6B4F" />
            <Stop offset="0.75" stopColor={C.bgFelt} />
            <Stop offset="1" stopColor="#0A2A21" />
          </RadialGradient>
        </Defs>
        <Ellipse cx={cx} cy={h * 0.47} rx={w * 0.6} ry={h * 0.5} fill="url(#felt)" stroke={C.gold} strokeOpacity={0.55} strokeWidth={2} />
        <Ellipse cx={cx} cy={h * 0.47} rx={w * 0.56} ry={h * 0.47} fill="none" stroke={C.gold} strokeOpacity={0.18} strokeDasharray="2 6" />
      </Svg>

      {/* Sherik — tepada */}
      <SeatView snap={snap} seat={seatAt('top')} active={actor === seatAt('top')} style={{ position: 'absolute', top: 6, left: cx - 40, width: 80 }} />
      <Backs count={g.counts[seatAt('top')]} style={{ position: 'absolute', top: 92, left: cx - 36 }} />
      {/* Raqiblar — chap va o'ng */}
      <SeatView snap={snap} seat={seatAt('left')} active={actor === seatAt('left')} style={{ position: 'absolute', top: cy - 64, left: 4, width: 76 }} />
      <Backs count={g.counts[seatAt('left')]} vertical style={{ position: 'absolute', top: cy + 26, left: 18 }} />
      <SeatView snap={snap} seat={seatAt('right')} active={actor === seatAt('right')} style={{ position: 'absolute', top: cy - 64, right: 4, width: 76 }} />
      <Backs count={g.counts[seatAt('right')]} vertical style={{ position: 'absolute', top: cy + 26, right: 18 }} />

      {/* Yurilgan kartalar */}
      {g.trick?.plays.map((p, i) => (
        <TrickPlay key={`${g.trick!.k}-${p.seat}-${i}`} play={p} best={i === g.trick!.best && g.trick!.plays.length > 1} center={pos[sideOf(p.seat, me)]} />
      ))}

      {/* Koloda va ko'zir */}
      <Deck g={g} style={{ position: 'absolute', left: 20, bottom: 18 }} />

      {!!text && (
        <View style={[styles.event, { bottom: 98 }]} pointerEvents="none">
          <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.text, textAlign: 'center' }} numberOfLines={2}>
            {text}
          </Text>
        </View>
      )}
    </View>
  );
}

function SeatView({ snap, seat, active, style }: { snap: RoomSnapshot; seat: number; active: boolean; style: object }) {
  const s = snap.seats[seat];
  const name = seatName(snap, seat);
  return (
    <View style={[{ alignItems: 'center' }, style]}>
      <Avatar name={s?.name ?? name} team={E.teamOf(seat)} size={52} active={active} label={name} />
      {seat === (snap.mySeat + 2) % 4 && <Text style={{ fontFamily: F.semibold, fontSize: 10, color: C.muted, marginTop: -2 }}>sherik</Text>}
    </View>
  );
}

function Backs({ count, vertical, style }: { count: number; vertical?: boolean; style: object }) {
  if (!count) return null;
  return (
    <View style={[{ flexDirection: vertical ? 'column' : 'row' }, style]}>
      {Array.from({ length: count }, (_, i) => (
        <CardBack
          key={i}
          width={30}
          style={vertical ? { marginTop: i ? -34 : 0, transform: [{ rotate: '90deg' }] } : { marginLeft: i ? -18 : 0, transform: [{ rotate: `${(i - (count - 1) / 2) * 8}deg` }] }}
        />
      ))}
    </View>
  );
}

function TrickPlay({ play, best, center }: { play: Play; best: boolean; center: { x: number; y: number } }) {
  const [appear] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [appear]);
  const n = play.n;
  const step = 16;
  const totalW = CW + (n - 1) * step;
  const ch = cardHeight(CW);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: center.x - totalW / 2,
        top: center.y - ch / 2,
        width: totalW,
        height: ch,
        opacity: appear,
        transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
      }}
    >
      {Array.from({ length: n }, (_, i) => {
        // Yopiq berilgan kartani faqat o'zi ko'radi (xira)
        const card = play.cards ? play.cards[i] : null;
        return (
          <PlayingCard
            key={i}
            card={card}
            dimmed={!play.up && !!card}
            width={CW}
            selected={best && i === n - 1}
            style={{ position: 'absolute', left: i * step, transform: [{ rotate: `${(i - (n - 1) / 2) * 5}deg` }] }}
          />
        );
      })}
    </Animated.View>
  );
}

function Deck({ g, style }: { g: GameView; style: object }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 14 }, style]}>
      <View style={{ width: 70, height: 70, justifyContent: 'center' }}>
        {g.trumpInStock && <PlayingCard card={g.trumpCard} width={42} style={{ position: 'absolute', left: 30, transform: [{ rotate: '90deg' }] }} />}
        {g.stock > 0 &&
          [0, 1, 2].slice(0, Math.min(3, g.stock)).map((i) => <CardBack key={i} width={44} style={{ position: 'absolute', left: i * 1.5, top: 3 - i * 1.5 }} />)}
      </View>
      <View style={{ gap: 6 }}>
        <Pill border="rgba(217,174,82,0.5)" color="rgba(8,22,19,0.8)">
          <PillText color={C.muted} weight={F.bold}>Ko‘zir</PillText>
          <Suit suit={g.trump} size={14} color={g.trump === 'H' || g.trump === 'D' ? '#E0475B' : C.text} />
          <PillText>· {g.stock} karta</PillText>
        </Pill>
        {g.hiddenInStock && (
          <Pill color="rgba(8,22,19,0.6)">
            <Icon d={ICONS.lock} size={13} color={C.gold} strokeWidth={2} />
            <PillText color={C.muted} size={11}>Yopiq karta oxirida</PillText>
          </Pill>
        )}
      </View>
    </View>
  );
}

function Hand({ snap, g, send, bottomInset }: { snap: RoomSnapshot; g: GameView; send: (m: Record<string, unknown>) => boolean; bottomInset: number }) {
  const [picked, setPicked] = useState<{ key: string; cards: Card[] }>({ key: '', cards: [] });
  const hand = useMemo(() => (g.hand ? E.sortHand(g.hand, g.trump) : []), [g.hand, g.trump]);
  const me = snap.mySeat;
  const myTurn = snap.phase === 'playing' && actorOf(g) === me;
  const following = myTurn && g.phase === 'follow' && !!g.trick;
  const k = following ? g.trick!.k : 0;
  const bestCards = following ? g.trick!.plays[g.trick!.best].cards ?? [] : [];

  // Navbat yoki qo'l o'zgarsa — tanlov tozalanadi
  const turnKey = `${g.phase}-${g.turn}-${g.leader}-${hand.join(',')}`;
  const sel = picked.key === turnKey ? picked.cards : [];

  const toggle = (c: Card) => {
    if (!myTurn) return;
    tap();
    let next: Card[];
    if (sel.includes(c)) next = sel.filter((x) => x !== c);
    else if (following) next = sel.length >= k ? [...sel.slice(1), c] : [...sel, c];
    // Yurishda faqat bir xil mastdagi kartalar
    else next = [...sel.filter((x) => E.suitOf(x) === E.suitOf(c)), c];
    setPicked({ key: turnKey, cards: next });
  };

  const canLead = myTurn && !following && sel.length > 0 && E.isValidLead(sel);
  const canBeat = following && sel.length === k && E.setBeats(sel, bestCards, g.trump);
  const canDiscard = following && sel.length === k;

  // Yurish taymeri
  const [timer] = useState(() => new Animated.Value(1));
  useEffect(() => {
    timer.stopAnimation();
    if (!myTurn || !snap.deadlineTotal) return;
    timer.setValue(snap.deadlineIn / snap.deadlineTotal);
    Animated.timing(timer, { toValue: 0, duration: snap.deadlineIn, easing: Easing.linear, useNativeDriver: false }).start();
  }, [myTurn, turnKey, snap.deadlineIn, snap.deadlineTotal, timer]);

  const cw = 86;
  const n = hand.length;
  const overlap = n > 1 ? Math.min(cw * 0.25, 18) : 0;

  let help = 'Jamoangiz hali karta olmadi';
  if (g.teamCards) help = g.teamKnown != null ? `Jamoa: ${g.teamKnown} ochiq ochko${g.teamHidden ? `, ${g.teamHidden} ta yopiq` : ''}` : `Jamoa olgan: ${g.teamCards} ta karta`;

  return (
    <View style={{ paddingBottom: Math.max(bottomInset, 12) }}>
      <View style={{ alignItems: 'center', height: 34, justifyContent: 'center' }}>
        {myTurn ? (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Pill color={C.gold}>
              <PillText color={C.onGold} weight={F.extrabold} size={13}>
                {following ? `Navbatingiz · ${k} ta karta bilan javob bering` : 'Navbatingiz · yuring'}
              </PillText>
            </Pill>
            <View style={styles.timerTrack}>
              <Animated.View style={{ height: 4, borderRadius: 2, backgroundColor: C.gold, width: timer.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
            </View>
          </View>
        ) : snap.phase === 'playing' && actorOf(g) >= 0 ? (
          <Text style={{ fontFamily: F.semibold, color: C.muted, fontSize: 13 }}>Navbat: {seatName(snap, actorOf(g))}</Text>
        ) : null}
      </View>

      <View style={{ height: cardHeight(cw) + 34, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', paddingBottom: 6 }}>
        {hand.map((c, i) => {
          const mid = (n - 1) / 2;
          const off = i - mid;
          const chosen = sel.includes(c);
          return (
            <Pressable
              key={c}
              testID={`hand-${c}`}
              accessibilityLabel={`Karta ${c}${chosen ? ', tanlangan' : ''}`}
              onPress={() => toggle(c)}
              style={{
                marginLeft: i ? -overlap : 0,
                zIndex: i,
                transform: [{ translateY: off * off * 5 - (chosen ? 24 : 0) }, { rotate: `${off * 6}deg` }],
              }}
            >
              <PlayingCard card={c} width={cw} selected={chosen} />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 10, letterSpacing: 1.2, color: C.muted }}>OLINGAN</Text>
          <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.teamA }} numberOfLines={2}>
            {help}
          </Text>
        </View>
        {following ? (
          <>
            <GoldButton label="Yopiq berish" variant="secondary" height={48} fontSize={15} disabled={!canDiscard} onPress={() => send({ t: 'act', action: { type: 'discard', cards: sel } })} style={{ width: 132 }} />
            <GoldButton testID="beat" label="Urish" height={48} disabled={!canBeat} onPress={() => send({ t: 'act', action: { type: 'beat', cards: sel } })} style={{ width: 96 }} />
          </>
        ) : (
          <GoldButton testID="lead" label="Yurish" height={48} disabled={!canLead} onPress={() => send({ t: 'act', action: { type: 'lead', cards: sel } })} style={{ width: 128 }} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hud: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  score: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 10,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(8,22,19,0.75)',
    borderWidth: 1.5,
  },
  event: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(8,22,19,0.72)',
    borderWidth: 1,
    borderColor: C.strokeSubtle,
  },
  timerTrack: { width: 120, height: 4, borderRadius: 2, backgroundColor: C.strokeSubtle, overflow: 'hidden' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 4 },
  error: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    maxWidth: '84%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(194,30,50,0.92)',
  },
});
