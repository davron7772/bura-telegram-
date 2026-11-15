import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Avatar, Background, GoldButton, IconButton, ICONS } from '@/components/ui';
import { useGame } from '@/game/store';
import { C, F, teamColor, teamName } from '@/theme';

const RULES = [
  ['4 ta karta', 'Yopiq ko‘zir', '61 ochko'],
  ['14 — mag‘lubiyat', '12 — imkoniyat', '4 tuz — g‘alaba'],
];

export default function Lobby() {
  const insets = useSafeAreaInsets();
  const { startWithBots } = useGame();
  const [note, setNote] = useState<string | null>(null);

  // Sherik ro'parada: 1 va 3-o'rin (A), 2 va 4-o'rin (B)
  const teams: { team: number; seats: (string | null)[] }[] = [
    { team: 0, seats: ['Siz', null] },
    { team: 1, seats: [null, null] },
  ];

  return (
    <Background>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 24, flexGrow: 1 }} bounces={false}>
        <View style={styles.nav}>
          <IconButton d={ICONS.back} label="Orqaga" onPress={() => router.back()} />
          <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.text }}>Do‘stlar xonasi</Text>
          <IconButton d={ICONS.share} label="Ulashish" onPress={() => setNote('Do‘stlarni taklif qilish onlayn rejim bilan birga qo‘shiladi')} />
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <View style={styles.code}>
            <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.muted, letterSpacing: 1.4 }}>XONA KODI</Text>
            <Text style={styles.codeText}>– – – –</Text>
            <Text style={{ fontFamily: F.medium, fontSize: 12, color: C.muted, textAlign: 'center' }}>
              Onlayn xonalar tez orada. Hozircha bo‘sh o‘rinlarga kompyuter o‘tiradi.
            </Text>
          </View>
        </View>

        <View style={styles.teams}>
          {teams.map((t) => (
            <View key={t.team} style={[styles.teamCard, { borderColor: teamColor(t.team) + '99' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: teamColor(t.team) }} />
                <Text style={{ fontFamily: F.extrabold, fontSize: 12, letterSpacing: 1.2, color: teamColor(t.team) }}>{teamName(t.team).toUpperCase()}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 14 }}>
                {t.seats.map((s, i) =>
                  s ? (
                    <Avatar key={i} name={s} team={t.team} />
                  ) : (
                    <View key={i} style={{ alignItems: 'center', gap: 5 }}>
                      <View style={styles.empty}>
                        <Text style={{ fontFamily: F.bold, fontSize: 24, color: C.muted }}>+</Text>
                      </View>
                      <Text style={{ fontFamily: F.semibold, fontSize: 13, color: C.muted }}>Kutilmoqda</Text>
                    </View>
                  ),
                )}
              </View>
            </View>
          ))}
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 22, gap: 10 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.text }}>Qoidalar</Text>
          {RULES.map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {row.map((r) => (
                <View key={r} style={styles.chip}>
                  <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.text }}>{r}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        <View style={{ flex: 1, minHeight: 24 }} />

        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {note && <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.muted, textAlign: 'center' }}>{note}</Text>}
          <GoldButton label="Do‘stni taklif qilish" variant="secondary" onPress={() => setNote('Do‘stlarni taklif qilish onlayn rejim bilan birga qo‘shiladi')} />
          <GoldButton
            label="Botlar bilan boshlash"
            onPress={() => {
              startWithBots();
              router.replace('/game');
            }}
          />
        </View>
      </ScrollView>
    </Background>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 6 },
  code: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(16,38,31,0.9)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(217,174,82,0.45)',
  },
  codeText: { fontFamily: F.display, fontSize: 40, lineHeight: 50, color: C.goldLight, letterSpacing: 6 },
  teams: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 20 },
  teamCard: {
    flex: 1,
    alignItems: 'center',
    gap: 14,
    paddingTop: 16,
    paddingBottom: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(16,38,31,0.9)',
    borderWidth: 1.5,
  },
  empty: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(147,170,160,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: C.surfaceRaised,
    borderWidth: 1,
    borderColor: C.strokeSubtle,
  },
});
