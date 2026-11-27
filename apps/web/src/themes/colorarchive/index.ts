import type { ThemeDefinition } from '../types';

export const colorarchive: ThemeDefinition = {
  id: 'colorarchive',
  name: 'Color Archive',
  deep: '#f6efe0',
  fonts: 'family=Syne:wght@500;700;800&family=DM+Mono:wght@400;500',
  swatches: ['#8c2a20', '#462e24', '#f6efe0'],
  variants: { meter: 'led', moodFace: 'line' },
  hero: {
    name: 'Swatch Kid',
    eyes: 'M70 40 L76 40 M90 40 L84 40',
    slotNames: { helm: 'Round Head', armor: 'Swatch Coat', legs: 'Swatch Legs', blade: 'Hex Tag' },
    pieces: {
      helm: {
        color: '#2f5f8f',
        delay: 0,
        svg: '<path d="M56 36 a24 24 0 1 0 48 0 a24 24 0 1 0 -48 0 M64 60 L96 60 M70 46 C74 52 86 52 90 46"/>',
      },
      armor: {
        color: '#a8780a',
        delay: 0.35,
        svg: '<path d="M54 66 L106 66 L106 82 L54 82 Z M54 84 L106 84 L106 100 L54 100 Z M54 102 L106 102 L106 118 L54 118 Z M58 70 L46 100 L54 110 M102 70 L112 96"/>',
      },
      legs: {
        color: '#a8402f',
        delay: 0.7,
        svg: '<path d="M58 120 L78 120 L78 196 L58 196 Z M82 120 L102 120 L102 196 L82 196 Z M58 150 L78 150 M82 150 L102 150"/>',
      },
      blade: {
        color: '#462e24',
        delay: 1.05,
        svg: '<path d="M110 70 L148 70 L148 92 L110 92 Z M114 78 L142 78 M114 84 L134 84"/>',
      },
    },
  },
};
