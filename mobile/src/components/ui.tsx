import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { C, F, teamColor } from '@/theme';

/** Ekran foni: markazda yorug'roq yashil, chetlarda to'q */
export function Background({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flex: 1, backgroundColor: C.bgBase }, style]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="bg" cx="50%" cy="45%" rx="75%" ry="55%">
            <Stop offset="0" stopColor="#1B5E46" />
            <Stop offset="1" stopColor={C.bgBase} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#bg)" />
      </Svg>
      {children}
    </View>
  );
}

export const tap = () => {
  Haptics.selectionAsync().catch(() => {});
};

interface BtnProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  height?: number;
  testID?: string;
  fontSize?: number;
}

export function GoldButton({ label, onPress, variant = 'primary', disabled, style, height = 56, testID, fontSize }: BtnProps) {
  const primary = variant === 'primary';
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        { height, borderRadius: 16, opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
        primary && styles.goldGlow,
        style,
      ]}
    >
      {primary ? (
        <LinearGradient colors={[C.goldLight, C.goldDeep]} style={[styles.btnInner, { borderRadius: 16 }]}>
          <Text numberOfLines={1} style={[styles.btnText, { color: C.onGold }, fontSize ? { fontSize } : null]}>{label}</Text>
        </LinearGradient>
      ) : (
        <View style={[styles.btnInner, styles.secondary]}>
          <Text numberOfLines={1} style={[styles.btnText, { color: C.text }, fontSize ? { fontSize } : null]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Avatar({ name, team, size = 60, active, label, dim }: { name: string; team: number; size?: number; active?: boolean; label?: string; dim?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <View style={{ alignItems: 'center', gap: 5, opacity: dim ? 0.6 : 1 }}>
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: C.surfaceRaised,
            borderWidth: 3,
            borderColor: teamColor(team),
            alignItems: 'center',
            justifyContent: 'center',
          },
          active && { borderColor: C.gold, shadowColor: C.gold, shadowOpacity: 0.9, shadowRadius: 14, elevation: 10 },
        ]}
      >
        <Text style={{ fontFamily: F.extrabold, color: C.text, fontSize: size * 0.32 }}>{initials}</Text>
      </View>
      {label !== '' && <Text style={{ fontFamily: F.semibold, color: C.text, fontSize: 13 }}>{label ?? name}</Text>}
    </View>
  );
}

export function Pill({ children, color = C.bgBase, border, style }: { children: ReactNode; color?: string; border?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.pill, { backgroundColor: color }, border ? { borderWidth: 1, borderColor: border } : null, style]}>{children}</View>
  );
}

export function PillText({ children, color = C.text, size = 12, weight = F.semibold }: { children: ReactNode; color?: string; size?: number; weight?: string }) {
  return <Text style={{ color, fontSize: size, fontFamily: weight }}>{children}</Text>;
}

export function Icon({ d, size = 22, color = C.text, strokeWidth = 1.8 }: { d: string; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export const ICONS = {
  back: 'M15 18l-6-6 6-6',
  share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13',
  home: 'M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  bag: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  gift: 'M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  close: 'M6 6l12 12M18 6L6 18',
};

export function IconButton({ d, onPress, label }: { d: string; onPress?: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
    >
      <Icon d={d} />
    </Pressable>
  );
}

export function Coin({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Circle cx="10" cy="10" r="9" fill={C.gold} />
      <Circle cx="10" cy="10" r="6.5" fill="none" stroke={C.goldLight} strokeWidth="1.4" />
      <Path d="M10 5.8l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3L5.7 8.9l3-.4z" fill="#7A5514" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  btnInner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondary: { borderRadius: 16, backgroundColor: C.surfaceRaised, borderWidth: 1.5, borderColor: 'rgba(217,174,82,0.55)' },
  btnText: { fontFamily: F.extrabold, fontSize: 17, letterSpacing: 0.2 },
  goldGlow: { shadowColor: C.gold, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.surfaceRaised,
    borderWidth: 1,
    borderColor: C.strokeSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
