import type { ThemeDefinition } from '../types';

export const cyberpunk: ThemeDefinition = {
  id: 'cyberpunk',
  name: 'Cyberpunk',
  deep: '#07040f',
  fonts: 'family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700',
  swatches: ['#ff2e97', '#19e0ff', '#07040f'],
  variants: { meter: 'led', moodFace: 'line' },
  hero: {
    name: 'Runner',
    eyes: 'M72 40 L88 40',
    slotNames: { helm: 'Headset', armor: 'Jacket', legs: 'Boots', blade: 'Whip' },
    pieces: {
      helm: {
        color: '#ff7bd0',
        delay: 0,
        svg: '<path d="M70 38 C70 28 74 24 80 24 C86 24 90 28 90 38 C90 48 86 55 80 56 C74 55 70 48 70 38 Z M68 36 L92 36 L90 43 L70 43 Z M70 31 C72 23 88 23 90 31 M72 25 L67 13 L77 22 M88 25 L93 13 L83 22 M70 32 C62 31 58 38 58 50 C58 60 55 66 50 72 M90 32 C98 31 102 38 102 50 C102 60 105 66 110 72"/>',
      },
      armor: {
        color: '#ff2e97',
        delay: 0.35,
        svg: '<path d="M68 56 L72 63 L88 63 L92 56 M54 66 L68 59 L68 78 L56 82 Z M106 66 L92 59 L92 78 L104 82 Z M68 63 L92 63 L90 98 L70 98 Z M80 63 L80 98 M66 98 L94 98 M73 74 L78 74 M82 74 L87 74 M56 82 L50 102 L56 114 M104 82 L110 98 L109 108"/>',
      },
      legs: {
        color: '#19e0ff',
        delay: 0.7,
        svg: '<path d="M70 98 L90 98 L93 114 L67 114 Z M68 114 L65 160 L67 206 L78 206 L80 120 M92 114 L95 160 L93 206 L82 206 L80 120 M66 148 L78 148 M82 148 L94 148 M65 176 L79 176 M81 176 L95 176 M60 208 L79 208 M81 208 L100 208 M62 213 L78 213 M82 213 L98 213"/>',
      },
      blade: {
        color: '#c9a3ff',
        delay: 1.05,
        svg: '<path d="M104 106 L113 110 M113 110 C136 104 148 82 136 64 C128 52 138 42 152 46 M150 46 L157 40 M152 47 L159 52 M137 66 L144 62 M133 90 L141 92"/>',
      },
    },
  },
};
