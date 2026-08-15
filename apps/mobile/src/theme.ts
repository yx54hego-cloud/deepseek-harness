/** Mobile role colors derived from the existing DeepSeek Harness theme. */

export interface Theme {
  background: string
  surface: string
  elevated: string
  text: string
  secondary: string
  tertiary: string
  border: string
  blue: string
  blueSoft: string
  blueStrong: string
  green: string
  amber: string
  red: string
  input: string
  userBubble: string
}

/** Resolve light or dark semantic colors. */
export function themeFor(dark: boolean): Theme {
  return dark
    ? {
      background: '#151517', surface: '#232324', elevated: '#2C2C2E', text: '#F9FAFB',
      secondary: '#CFD3D6', tertiary: '#ADB2B8', border: 'rgba(255,255,255,0.12)',
      blue: '#679EFE', blueSoft: '#343F58', blueStrong: '#5686FE', green: '#4ED17E',
      amber: '#F7AD31', red: '#F25A5A', input: '#232324', userBubble: '#343F58',
    }
    : {
      background: '#FFFFFF', surface: '#F9FAFB', elevated: '#FFFFFF', text: '#0F1115',
      secondary: '#61666B', tertiary: '#81858C', border: 'rgba(0,0,0,0.10)',
      blue: '#4176E6', blueSoft: '#EDF3FE', blueStrong: '#345FAF', green: '#22C55E',
      amber: '#DD8629', red: '#EC1313', input: '#FFFFFF', userBubble: '#EDF3FE',
    }
}
