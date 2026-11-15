// Figma'dagi "Bura tokens" bilan bir xil ranglar va shriftlar.
export const C = {
  bgBase: '#081613',
  bgFelt: '#0E3A2D',
  bgFeltLight: '#17583F',
  surfaceCard: '#10261F',
  surfaceRaised: '#173529',
  strokeSubtle: '#2B4C40',
  gold: '#D9AE52',
  goldLight: '#F3DC9A',
  goldDeep: '#C9963A',
  text: '#F6F0E1',
  muted: '#93AAA0',
  onGold: '#1D1406',
  ivory: '#FBF6EA',
  ink: '#1B1B1B',
  red: '#C21E32',
  teamA: '#43D6A6',
  teamB: '#FF7E5F',
} as const;

export const teamColor = (team: number) => (team === 0 ? C.teamA : C.teamB);
export const teamName = (team: number) => (team === 0 ? 'Jamoa A' : 'Jamoa B');

export const F = {
  display: 'Cinzel_900Black',
  displayBold: 'Cinzel_700Bold',
  rank: 'PlayfairDisplay_700Bold',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;
