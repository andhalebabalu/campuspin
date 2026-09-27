import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Design tokens, mirroring the web app's (apps/web/src/app/globals.css) so both apps read as one
 * brand. Screens use the semantic names (`colors.ink`, `colors.action`), not raw palette steps.
 */
export const palette = {
  white: '#ffffff',
  primary50: '#eff6fe',
  primary100: '#dbeafd',
  primary200: '#bad7fb',
  primary400: '#509bf6',
  primary500: '#187bf3',
  primary600: '#0b63cf',
  primary700: '#084590',
  primary800: '#052f63',
  primary900: '#042349',
  ink900: '#0b1220',
  ink800: '#111b30',
  ink700: '#1b2842',
  accent50: '#edf8ee',
  accent400: '#2c963c',
  accent600: '#1f7a2e',
  accent700: '#0f5712',
  neutral25: '#fafbfc',
  neutral50: '#f4f6f9',
  neutral100: '#ebeef3',
  neutral200: '#dde2ea',
  neutral300: '#c4cbd8',
  neutral400: '#9aa3b5',
  neutral500: '#6b7589',
  neutral600: '#4f586b',
  neutral700: '#3a4255',
  success50: '#e8f7f0',
  success600: '#12805c',
  danger50: '#fef1f0',
  danger600: '#d92d20',
  danger700: '#b42318',
  amber50: '#fff4e8',
  amber600: '#d9650b',
  violet50: '#f3effe',
  violet600: '#6d3fd6',
  rose50: '#fdeff1',
  rose600: '#d62c4a',
  teal50: '#e7f7f6',
  teal600: '#0e8a83',
} as const;

export const colors = {
  canvas: '#f5f7fb',
  surface: palette.white,
  subtle: palette.neutral50,
  line: palette.neutral200,
  lineStrong: palette.neutral300,
  ink: palette.ink900,
  body: palette.neutral600,
  muted: palette.neutral500,
  placeholder: palette.neutral400,
  action: palette.primary600,
  actionPressed: palette.primary700,
  actionSoft: palette.primary50,
  primaryBorder: palette.primary200,
  accent: palette.accent600,
  accentSoft: palette.accent50,
  success: palette.success600,
  successSoft: palette.success50,
  danger: palette.danger600,
  dangerSoft: palette.danger50,
  warning: palette.amber600,
  warningSoft: palette.amber50,
  overlay: 'rgba(11, 18, 32, 0.45)',
} as const;

/** The brand gradient used on hero headers and the primary button. */
export const brandGradient = [palette.primary800, palette.primary600] as const;
export const heroGradient = [palette.primary900, palette.primary700, palette.primary500] as const;

/** Soft tints for category chips and icon tiles: [background, foreground]. */
export const tints = {
  blue: [palette.primary50, palette.primary600],
  green: [palette.accent50, palette.accent600],
  amber: [palette.amber50, palette.amber600],
  violet: [palette.violet50, palette.violet600],
  rose: [palette.rose50, palette.rose600],
  teal: [palette.teal50, palette.teal600],
  slate: [palette.neutral100, palette.neutral600],
} as const;
export type Tint = keyof typeof tints;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  display: 'PlusJakartaSans_700Bold',
  displayHeavy: 'PlusJakartaSans_800ExtraBold',
} as const;

export const type = {
  hero: { fontFamily: fonts.displayHeavy, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  subheading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.3 },
} satisfies Record<string, TextStyle>;
export type TypeVariant = keyof typeof type;

function shadow(offsetY: number, blur: number, opacity: number, elevation: number): ViewStyle {
  return Platform.select<ViewStyle>({
    android: { elevation, shadowColor: palette.ink900 },
    default: {
      shadowColor: palette.ink900,
      shadowOffset: { width: 0, height: offsetY },
      shadowRadius: blur,
      shadowOpacity: opacity,
    },
  });
}

export const shadows = {
  sm: shadow(1, 3, 0.07, 1),
  md: shadow(6, 16, 0.09, 4),
  lg: shadow(14, 30, 0.16, 10),
} as const;
