import type { ThemeDefinition } from '../types';

export const streetfighter: ThemeDefinition = {
  id: 'streetfighter',
  name: 'Arcade',
  deep: '#070a1f',
  fonts: 'family=Russo+One&family=Chakra+Petch:wght@500;600;700',
  swatches: ['#ffd400', '#36a3ff', '#070a1f'],
  variants: { meter: 'led', moodFace: 'line' },
  hero: {
    name: 'Fighter',
    eyes: 'M72 40 L77 40 M88 40 L83 40',
    slotNames: { helm: 'Headband', armor: 'Gi', legs: 'Stance', blade: 'Fireball' },
    pieces: {
      helm: {
        color: '#ff8a93',
        delay: 0,
        svg: '<path d="M66 40 C66 28 72 23 80 23 C88 23 94 28 94 40 C94 50 88 57 80 57 C72 57 66 50 66 40 Z M68 31 L65 20 L73 25 L77 14 L83 24 L91 16 L92 28 M66 35 L94 35 M66 40 L94 40 M94 37 C104 34 113 38 121 47 M94 39 C102 41 108 48 111 58 M74 52 L86 52"/>',
      },
      armor: {
        color: '#f2f2ff',
        delay: 0.35,
        svg: '<path d="M62 58 L98 58 L102 78 L100 100 L60 100 L58 78 Z M72 58 L80 78 L88 58 M60 100 L100 100 L100 108 L60 108 Z M80 108 L75 126 M80 108 L87 124 M62 60 L42 78 L50 62 M66 68 L48 88 L58 72 M42 78 L48 88 M98 60 L112 66 L122 73 M98 76 L110 80 L122 80 M122 73 L127 77 L122 80"/><circle cx="50" cy="58" r="7"/>',
      },
      legs: {
        color: '#36a3ff',
        delay: 0.7,
        svg: '<path d="M60 108 L100 108 L108 140 L114 202 L90 202 L82 140 L78 140 L70 202 L46 202 L52 140 Z M52 150 L74 150 M108 150 L88 150 M48 188 L70 188 M92 188 L114 188 M42 206 L72 206 M88 206 L118 206"/>',
      },
      blade: {
        color: '#ffd400',
        delay: 1.05,
        svg: '<path d="M98 62 L118 68 L136 78"/><circle cx="140" cy="77" r="11"/><circle cx="140" cy="77" r="5"/><path d="M129 72 L124 70 M129 83 L125 87 M140 66 L142 54 M140 88 L143 101 M150 71 L158 67 M150 83 L158 87"/>',
      },
    },
  },
};
