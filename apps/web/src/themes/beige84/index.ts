import type { ThemeDefinition } from '../types';

export const beige84: ThemeDefinition = {
  id: 'beige84',
  name: "Beige Box '84",
  deep: '#1d241f',
  fonts: 'family=IBM+Plex+Mono:wght@500;700&family=Archivo:wght@500;800',
  swatches: ['#b8372b', '#3a6ea5', '#1d241f'],
  variants: { meter: 'led', moodFace: 'line' },
  hero: {
    name: 'Beige Box',
    eyes: 'M70 38 L76 38 M90 38 L84 38',
    slotNames: { helm: 'CRT', armor: 'Keyboard', legs: 'Tower', blade: 'Floppy' },
    pieces: {
      helm: {
        color: '#3a352b',
        delay: 0,
        svg: '<path d="M56 12 L104 12 L104 54 L56 54 Z M62 18 L98 18 L98 48 L62 48 Z M70 54 L70 62 L90 62 L90 54 M64 62 L96 62 L96 68 L64 68 Z M68 40 L74 40 M86 40 L92 40"/>',
      },
      armor: {
        color: '#b8561a',
        delay: 0.35,
        svg: '<path d="M52 74 L108 74 L108 116 L52 116 Z M58 80 L66 80 L66 88 L58 88 Z M58 90 L66 90 L66 98 L58 98 Z M68 80 L76 80 L76 88 L68 88 Z M68 90 L76 90 L76 98 L68 98 Z M78 80 L86 80 L86 88 L78 88 Z M78 90 L86 90 L86 98 L78 98 Z M88 80 L96 80 L96 88 L88 88 Z M88 90 L96 90 L96 98 L88 98 Z M98 80 L106 80 L106 88 L98 88 Z M98 90 L106 90 L106 98 L98 98 Z M58 104 L102 104 L102 110 L58 110 ZM58 70 L46 100 L54 110 M102 70 L112 96"/>',
      },
      legs: {
        color: '#3a352b',
        delay: 0.7,
        svg: '<path d="M62 120 L98 120 L98 196 L62 196 Z M68 130 L92 130 M68 140 L92 140 M72 176 L88 176 M60 196 L100 196 L106 208 L54 208 Z"/>',
      },
      blade: {
        color: '#b8372b',
        delay: 1.05,
        svg: '<path d="M110 92 L146 92 L146 128 L110 128 Z M118 92 L138 92 L138 104 L118 104 Z M116 110 L140 110 L140 128 L116 128 Z M124 96 L124 102"/>',
      },
    },
  },
};
