import type { ThemeDefinition } from '../types';

export const greekgod: ThemeDefinition = {
  id: 'greekgod',
  name: 'Gilded',
  deep: '#0b0a09',
  fonts: 'family=Cinzel:wght@500;700;900',
  swatches: ['#c9a24d', '#5b8bb5', '#0b0a09'],
  variants: { meter: 'led', moodFace: 'line' },
  hero: {
    name: 'Hoplite',
    eyes: 'M72 41 L77 41 M88 41 L83 41',
    slotNames: { helm: 'Helm', armor: 'Cuirass', legs: 'Greaves', blade: 'Spear' },
    pieces: {
      helm: {
        color: '#ecd28f',
        delay: 0,
        svg: '<path d="M66 41 C66 27 72 21 80 21 C88 21 94 27 94 41 L94 52 L88 58 L80 56 L72 58 L66 52 Z M80 37 L80 51 M70 22 C71 8 93 4 102 14 C100 18 98 22 96 24 M78 21 L78 11 M86 20 L88 8 M94 21 L98 12 M72 41 L88 41"/>',
      },
      armor: {
        color: '#c9a24d',
        delay: 0.35,
        svg: '<path d="M62 58 L98 58 L100 78 L96 102 L64 102 L60 78 Z M80 60 L80 96 M64 72 C72 79 77 77 80 72 M96 72 C88 79 83 77 80 72 M70 90 L90 90 M60 58 C50 58 45 65 45 74 L60 71 M100 58 C110 58 115 65 115 74 L100 71 M64 102 L59 124 M72 102 L70 126 M80 102 L80 128 M88 102 L90 126 M96 102 L101 124 M45 74 L40 94 M115 74 L119 94"/>',
      },
      legs: {
        color: '#d9b86a',
        delay: 0.7,
        svg: '<path d="M64 126 L61 160 L63 206 L78 206 L80 132 M96 126 L99 160 L97 206 L82 206 L80 132 M62 156 C64 149 77 149 79 156 M98 156 C96 149 83 149 81 156 M63 172 L78 172 M97 172 L82 172 M63 206 L56 212 L79 212 L78 206 M97 206 L104 212 L81 212 L82 206 M60 209 L76 209 M100 209 L84 209"/>',
      },
      blade: {
        color: '#fff3d0',
        delay: 1.05,
        svg: '<circle cx="30" cy="104" r="26"/><circle cx="30" cy="104" r="19"/><path d="M24 118 L30 92 L36 118 M26.5 108 L33.5 108 M119 28 L119 218 M119 6 L125 22 L119 28 L113 22 Z M116 98 L122 98"/>',
      },
    },
  },
};
