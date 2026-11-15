import Svg, { Path } from 'react-native-svg';
import { C } from '@/theme';
import type { Suit as SuitT } from '@/game/engine';

const PATHS: Record<SuitT, string> = {
  H: 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.2 0 3.7 1.3 5.4 3.3 1.7-2 3.2-3.3 5.4-3.3 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z',
  D: 'M12 1.5l8.2 10.5L12 22.5 3.8 12z',
  S: 'M12 2C9 6.5 3 9.6 3 14c0 2.8 2.2 4.6 4.6 4.6 1.6 0 2.9-.7 3.6-1.8-.2 1.9-1 3.4-2.4 4.7h6.4c-1.4-1.3-2.2-2.8-2.4-4.7.7 1.1 2 1.8 3.6 1.8 2.4 0 4.6-1.8 4.6-4.6 0-4.4-6-7.5-9-12z',
  C: 'M12 2.5a4.2 4.2 0 0 0-3.9 5.8A4.2 4.2 0 1 0 9.6 16.4c.6-.3 1.2-.7 1.6-1.2-.2 2.2-1 4-2.6 5.8h6.8c-1.6-1.8-2.4-3.6-2.6-5.8.4.5 1 .9 1.6 1.2a4.2 4.2 0 1 0 1.5-8.1A4.2 4.2 0 0 0 12 2.5z',
};

export function Suit({ suit, size = 16, color }: { suit: SuitT; size?: number; color?: string }) {
  const fill = color ?? (suit === 'H' || suit === 'D' ? C.red : C.ink);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={PATHS[suit]} fill={fill} />
    </Svg>
  );
}
