import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Background, GoldButton, Icon, ICONS } from './ui';
import type { RoomSnapshot } from '@/game/engine';
import { C, F, teamColor, teamName } from '@/theme';

const COLORS = ['#F3DC9A', '#D9AE52', '#43D6A6', '#FF7E5F', '#F6F0E1'];
// Konfetti joylari har safar bir xil (o'zgarmas urug')
const confetti = (() => {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  return Array.from({ length: 22 }, (_, i) => ({
    left: `${rnd() * 100}%` as const,
    top: rnd() * 150,
    w: 4 + rnd() * 5,
    h: 8 + rnd() * 8,
    rot: rnd() * 180,
    color: COLORS[i % COLORS.length],
    op: 0.5 + rnd() * 0.5,
  }));
})();

export function ResultOverlay({ snap, onNext, onHome }: { snap: RoomSnapshot; onNext: () => void; onHome: () => void }) {
  const insets = useSafeAreaInsets();
  const r = snap.result!;
  const myTeam = snap.myTeam;
  const won = r.type !== 'draw' && r.team === myTeam;
  const matchOver = r.matchOver;
  const matchWon = matchOver && r.matchWinner === myTeam;

  const title = r.type === 'draw' ? 'DURANG' : matchOver ? (matchWon ? 'MATCH SIZNIKI!' : 'MATCH YUTQAZILDI') : won ? 'G‘ALABA!' : 'MAG‘LUBIYAT';
  const subtitle =
    r.type === 'draw'
      ? '60:60 — keyingi raundda yutqazganga +2 ball'
      : r.type === 'aces'
        ? `4 ta tuz — ${teamName(r.team)} mutlaq g‘olib`
        : `${teamName(r.team)} bu raundni yutdi${r.award ? ` · ${teamName(r.loser)}: +${r.award} ball` : ''}`;
  const happy = r.type === 'draw' ? false : matchOver ? matchWon : won;


  return (
    <View style={StyleSheet.absoluteFill}>
      <Background>
        {happy &&
          confetti.map((c, i) => (
            <View
              key={i}
              pointerEvents="none"
              style={{ position: 'absolute', left: c.left, top: insets.top + c.top, width: c.w, height: c.h, borderRadius: 2, backgroundColor: c.color, opacity: c.op, transform: [{ rotate: `${c.rot}deg` }] }}
            />
          ))}
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 36, paddingBottom: insets.bottom + 24 }} bounces={false}>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View style={[styles.emblem, !happy && { shadowOpacity: 0 }]}>
              <LinearGradient colors={happy ? [C.goldLight, '#B98330'] : [C.surfaceRaised, C.surfaceCard]} style={styles.emblemInner}>
                <Icon d={ICONS.trophy} size={52} color={happy ? '#3A2708' : C.muted} />
              </LinearGradient>
            </View>
            <Text style={[styles.title, !happy && { color: C.text }]} adjustsFontSizeToFit numberOfLines={1}>
              {title}
            </Text>
            <Text style={{ fontFamily: F.semibold, fontSize: 15, color: C.muted, textAlign: 'center', paddingHorizontal: 24 }}>{subtitle}</Text>
          </View>

          <View style={{ paddingHorizontal: 20, paddingTop: 26, gap: 14 }}>
            <View style={[styles.card, styles.scoreRow]}>
              {[0, 1].map((t) => (
                <View key={t} style={{ alignItems: t === 0 ? 'flex-start' : 'flex-end', gap: 2 }}>
                  <Text style={styles.cap}>{teamName(t).toUpperCase()}{t === myTeam ? ' · SIZ' : ''}</Text>
                  <Text style={{ fontFamily: F.extrabold, fontSize: 34, lineHeight: 40, color: teamColor(t) }}>{r.points[t]}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.card, { gap: 14 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.text }}>Match hisobi</Text>
                <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.muted }}>{snap.lose} — mag‘lubiyat</Text>
              </View>
              {[0, 1].map((t) => {
                const v = r.score[t];
                const chance = v === snap.edge;
                return (
                  <View key={t} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ flex: 1, fontFamily: F.semibold, fontSize: 13, color: C.text }}>{teamName(t)}</Text>
                      {chance && (
                        <View style={styles.badge}>
                          <Text style={{ fontFamily: F.extrabold, fontSize: 11, color: C.onGold }}>Imkoniyat</Text>
                        </View>
                      )}
                      <Text style={{ fontFamily: F.extrabold, fontSize: 13, color: teamColor(t) }}>
                        {v} / {snap.lose}
                      </Text>
                    </View>
                    <View style={styles.track}>
                      <View style={{ width: `${Math.min(100, (v / snap.lose) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: teamColor(t) }} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={{ flex: 1, minHeight: 24 }} />
          <View style={{ paddingHorizontal: 20, gap: 12 }}>
            <GoldButton testID="next-round" label={matchOver ? 'Yangi match' : 'Keyingi raund'} onPress={onNext} />
            <GoldButton label="Bosh sahifaga" variant="secondary" onPress={onHome} />
          </View>
        </ScrollView>
      </Background>
    </View>
  );
}

const styles = StyleSheet.create({
  emblem: { width: 116, height: 116, borderRadius: 58, shadowColor: C.gold, shadowOpacity: 0.5, shadowRadius: 30, elevation: 10 },
  emblemInner: { flex: 1, borderRadius: 58, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.goldLight },
  title: { fontFamily: F.display, fontSize: 38, lineHeight: 48, color: C.goldLight, letterSpacing: 4, paddingHorizontal: 16 },
  card: { borderRadius: 20, padding: 18, backgroundColor: 'rgba(16,38,31,0.9)', borderWidth: 1, borderColor: C.strokeSubtle },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22 },
  cap: { fontFamily: F.bold, fontSize: 12, color: C.muted, letterSpacing: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: C.gold },
  track: { height: 8, borderRadius: 4, backgroundColor: C.surfaceRaised, overflow: 'hidden' },
});
