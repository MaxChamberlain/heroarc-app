import type { ThemeDefinition } from '../types';

export const alchemist: ThemeDefinition = {
  id: 'alchemist',
  name: "Alchemist's Lab",
  deep: '#e6e2d6',
  fonts:
    'family=IM+Fell+English:ital@0;1&family=Cinzel:wght@500;700&family=EB+Garamond:wght@500;600;700&family=Cormorant+Garamond:wght@600;700',
  swatches: ['#8a2224', '#2f6b4f', '#e6e2d6'],
  variants: { meter: 'hand-drawn', moodFace: 'engraved' },
  hero: {
    name: 'The Adept',
    eyes: 'M73 45 L77 45 M87 45 L83 45',
    slotNames: { helm: 'Sun Hood', armor: 'Robe', legs: 'Hem and Boots', blade: 'Alembic' },
    pieces: {
      helm: {
        color: '#8a6a1c',
        delay: 0,
        svg: '<path d="M67 46 a13 13 0 1 0 26 0 a13 13 0 1 0 -26 0 M63 52 C60 30 70 14 80 10 C90 14 100 30 97 52 M63 52 L58 62 L68 58 M97 52 L102 62 L92 58 M56.5 33.4 L47.1 30.0 M60.8 25.9 L53.2 19.5 M67.5 20.3 L62.5 11.7 M75.7 17.4 L73.9 7.5 M84.3 17.4 L86.1 7.5 M92.5 20.3 L97.5 11.7 M99.2 25.9 L106.8 19.5 M103.5 33.4 L112.9 30.0"/>',
      },
      armor: {
        color: '#3a7d5c',
        delay: 0.35,
        svg: '<path d="M62 64 L98 64 L106 130 L54 130 Z M62 66 L46 102 L56 110 L64 90 M98 66 L118 84 L128 88 M73 86 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 M80 76 L80 79 M80 93 L80 96 M70 86 L73 86 M87 86 L90 86 M57 112 L103 112 M80 112 L80 124 M70 100 L66 130 M90 100 L94 130"/>',
      },
      legs: {
        color: '#3e2723',
        delay: 0.7,
        svg: '<path d="M54 130 L48 188 L112 188 L106 130 M48 188 C56 195 66 195 72 188 C78 195 90 195 96 188 C102 195 108 195 112 188 M62 195 L56 212 L78 212 L78 195 M98 195 L104 212 L82 212 L82 195"/>',
      },
      blade: {
        color: '#9e2a2b',
        delay: 1.05,
        svg: '<path d="M122 112 a16 16 0 1 0 32 0 a16 16 0 1 0 -32 0 M132 97 L132 74 M144 97 L144 74 M127 74 L149 74 M122 112 Q138 106 154 112 M131 119 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M140.5 121 a1.5 1.5 0 1 0 3.0 0 a1.5 1.5 0 1 0 -3.0 0 M138 146 C130 140 134 134 138 126 C142 134 146 140 138 146 Z M124 160 L138 146 L152 160 M120 160 L156 160"/>',
      },
    },
  },
};
