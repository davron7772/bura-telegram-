import { memo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { G, Line } from 'react-native-svg';
import { C, F } from '@/theme';
import { E, isRed, rankLabel, type Card } from '@/game/engine';
import { Suit } from './Suit';

const RATIO = 104 / 72;

interface Props {
  /** Karta kodi; berilmasa — orqa tomoni */
  card?: Card | null;
  width?: number;
  selected?: boolean;
  dimmed?: boolean;
  style?: StyleProp<ViewStyle>;
}

function PlayingCardBase({ card, width = 72, selected, dimmed, style }: Props) {
  const w = width;
  const h = Math.round(w * RATIO);
  const k = w / 72;
  const radius = 9 * k;
  if (!card) return <CardBack width={w} style={style} />;

  const suit = E.suitOf(card);
  const color = isRed(card) ? C.red : C.ink;
  const rank = rankLabel(card);
  const rankSize = (rank.length > 1 ? 19 : 22) * k;

  return (
    <View
      style={[
        styles.shadow,
        { width: w, height: h, borderRadius: radius, backgroundColor: C.ivory },
        selected && { borderColor: C.gold, borderWidth: 2.5 * k, shadowColor: C.gold, shadowOpacity: 0.7, shadowRadius: 14 },
        dimmed && { opacity: 0.45 },
        style,
      ]}
    >
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' }]} />
      <View style={{ position: 'absolute', left: 6 * k, top: 4 * k, alignItems: 'center' }}>
        <Text style={{ fontFamily: F.rank, fontSize: rankSize, lineHeight: rankSize * 1.1, color }}>{rank}</Text>
        <Suit suit={suit} size={12 * k} />
      </View>
      <View style={{ position: 'absolute', right: 6 * k, bottom: 4 * k, alignItems: 'center', transform: [{ rotate: '180deg' }] }}>
        <Text style={{ fontFamily: F.rank, fontSize: rankSize, lineHeight: rankSize * 1.1, color }}>{rank}</Text>
        <Suit suit={suit} size={12 * k} />
      </View>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Suit suit={suit} size={30 * k} />
      </View>
    </View>
  );
}

export const PlayingCard = memo(PlayingCardBase);

function CardBackBase({ width = 72, style }: { width?: number; style?: StyleProp<ViewStyle> }) {
  const w = width;
  const h = Math.round(w * RATIO);
  const k = w / 72;
  const inset = 5 * k;
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  const lines = [];
  for (let i = -ih; i < iw + ih; i += 11 * k) {
    lines.push(<Line key={`a${i}`} x1={i} y1={0} x2={i + ih} y2={ih} />);
    lines.push(<Line key={`b${i}`} x1={i + ih} y1={0} x2={i} y2={ih} />);
  }
  return (
    <View style={[styles.shadow, { width: w, height: h, borderRadius: 9 * k, overflow: 'hidden' }, style]}>
      <LinearGradient colors={['#17583F', '#0A2A20']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ position: 'absolute', left: inset, top: inset, width: iw, height: ih, borderRadius: 6 * k, overflow: 'hidden', borderWidth: 1.5 * Math.max(k, 0.6), borderColor: C.gold }}>
        <Svg width={iw} height={ih} style={{ opacity: 0.35 }}>
          <G stroke={C.gold} strokeWidth={0.8}>{lines}</G>
        </Svg>
      </View>
      {w >= 40 && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <View style={{ width: 30 * k, height: 30 * k, borderRadius: 15 * k, backgroundColor: C.bgBase, borderWidth: 1.5 * k, borderColor: C.gold, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.display, color: C.gold, fontSize: 15 * k, lineHeight: 18 * k }}>B</Text>
          </View>
        </View>
      )}
    </View>
  );
}

export const CardBack = memo(CardBackBase);

export const cardHeight = (w: number) => Math.round(w * RATIO);

const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
});
