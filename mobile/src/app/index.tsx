import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Background, Coin, GoldButton, Icon, ICONS, tap } from '@/components/ui';
import { PlayingCard } from '@/components/PlayingCard';
import { useGame } from '@/game/store';
import { C, F } from '@/theme';

const FAN = [
  { card: 'AH', rot: -21, dx: -70, dy: 18 },
  { card: '10S', rot: -7, dx: -25, dy: 0 },
  { card: 'KD', rot: 7, dx: 22, dy: 0 },
  { card: 'AC', rot: 21, dx: 66, dy: 18 },
];

const TABS = [
  { key: 'home', label: 'Asosiy', icon: ICONS.home },
  { key: 'rating', label: 'Reyting', icon: ICONS.trophy },
  { key: 'shop', label: 'Do‘kon', icon: ICONS.bag },
  { key: 'profile', label: 'Profil', icon: ICONS.user },
];

export default function Home() {
  const insets = useSafeAreaInsets();
  const { startWithBots } = useGame();
  const [coins, setCoins] = useState(1000);
  const [claimed, setClaimed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const soon = (what: string) => {
    setToast(`${what} — tez orada`);
    setTimeout(() => setToast(null), 1800);
  };

  const quickPlay = () => {
    startWithBots();
    router.push('/game');
  };

  return (
    <Background>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24 }} bounces={false}>
        <View style={styles.topBar}>
          <View style={styles.row}>
            <View style={styles.miniAvatar}>
              <Text style={{ fontFamily: F.extrabold, color: C.text, fontSize: 15 }}>SZ</Text>
            </View>
            <View>
              <Text style={{ fontFamily: F.bold, color: C.text, fontSize: 16 }}>Mehmon</Text>
              <Text style={{ fontFamily: F.medium, color: C.muted, fontSize: 12 }}>1-daraja · Yangi o‘yinchi</Text>
            </View>
          </View>
          <View style={styles.coins}>
            <Coin />
            <Text style={{ fontFamily: F.extrabold, color: C.goldLight, fontSize: 15 }}>{coins.toLocaleString('ru-RU')}</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <RadialGradient id="glow" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0" stopColor={C.gold} stopOpacity={0.4} />
                <Stop offset="1" stopColor={C.gold} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
          </Svg>
          {FAN.map((f) => (
            <PlayingCard
              key={f.card}
              card={f.card}
              width={97}
              style={{ position: 'absolute', left: '50%', top: 40 + f.dy, marginLeft: f.dx - 48.5, transform: [{ rotate: `${f.rot}deg` }] }}
            />
          ))}
        </View>

        <View style={{ alignItems: 'center', gap: 6, paddingBottom: 24 }}>
          <Text style={styles.logo}>BURA</Text>
          <Text style={{ fontFamily: F.semibold, color: C.muted, fontSize: 14, letterSpacing: 0.3 }}>2 × 2 jamoa  ·  61 ochkogacha</Text>
        </View>

        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <GoldButton testID="quick-play" label="Tezkor o‘yin" onPress={quickPlay} />
          <GoldButton label="Do‘stlar bilan xona" variant="secondary" onPress={() => router.push('/lobby')} />
          <GoldButton label="Xona kodini kiritish" variant="secondary" onPress={() => soon('Xona kodi')} />
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          <View style={styles.daily}>
            <View style={styles.gift}>
              <Icon d={ICONS.gift} color={C.gold} size={24} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: F.bold, color: C.text, fontSize: 15 }}>Kunlik sovg‘a</Text>
              <Text style={{ fontFamily: F.medium, color: C.muted, fontSize: 12 }}>
                {claimed ? 'Ertaga yana keling' : '+500 tanga · har kuni'}
              </Text>
            </View>
            <Pressable
              disabled={claimed}
              onPress={() => {
                tap();
                setCoins((c) => c + 500);
                setClaimed(true);
              }}
              style={[styles.claim, claimed && { backgroundColor: C.surfaceRaised }]}
            >
              <Text style={{ fontFamily: F.extrabold, fontSize: 13, color: claimed ? C.muted : C.onGold }}>{claimed ? 'Olindi' : 'Olish'}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {toast && (
        <View style={[styles.toast, { bottom: 96 + insets.bottom }]} pointerEvents="none">
          <Text style={{ fontFamily: F.semibold, color: C.text, fontSize: 13 }}>{toast}</Text>
        </View>
      )}

      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {TABS.map((t, i) => {
          const active = i === 0;
          const color = active ? C.gold : C.muted;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => (active ? null : soon(t.label))} accessibilityRole="tab" accessibilityState={{ selected: active }}>
              <Icon d={t.icon} color={color} size={24} />
              <Text style={{ fontFamily: active ? F.bold : F.semibold, fontSize: 11, color }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Background>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8 },
  miniAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.surfaceRaised,
    borderWidth: 2,
    borderColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coins: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 10,
    paddingRight: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: C.surfaceRaised,
    borderWidth: 1,
    borderColor: 'rgba(217,174,82,0.4)',
  },
  hero: { height: 230 },
  logo: { fontFamily: F.display, color: C.goldLight, fontSize: 56, lineHeight: 66, letterSpacing: 8 },
  daily: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(16,38,31,0.85)',
    borderWidth: 1,
    borderColor: C.strokeSubtle,
  },
  gift: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(217,174,82,0.15)', alignItems: 'center', justifyContent: 'center' },
  claim: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: C.gold },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 10,
    backgroundColor: 'rgba(8,22,19,0.92)',
    borderTopWidth: 1,
    borderTopColor: C.strokeSubtle,
  },
  tab: { alignItems: 'center', gap: 4, minWidth: 56 },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: C.surfaceRaised,
    borderWidth: 1,
    borderColor: C.strokeSubtle,
  },
});
