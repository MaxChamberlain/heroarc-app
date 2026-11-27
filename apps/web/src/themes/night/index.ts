import type { ThemeDefinition } from '../types';

export const night: ThemeDefinition = {
  id: 'night',
  name: 'Night',
  deep: '#000000',
  fonts: 'family=Zen+Old+Mincho:wght@600;900&family=Inter:wght@400;500;600;700',
  swatches: ['#c48a60', '#3c7382', '#050f15'],
  variants: { meter: 'led', moodFace: 'line' },
  hero: {
    name: 'Samurai',
    eyes: 'M72 40 L77 41 M88 40 L83 41',
    slotNames: { helm: 'Helm', armor: 'Armor', legs: 'Legs', blade: 'Blade' },
    pieces: {
      helm: {
        color: '#e6b88c',
        delay: 0,
        svg: '<path d="M69 42 C69 28 74 22 80 22 C86 22 91 28 91 42 L69 42 M70 41 C66 41 61 42 59 46 L61 56 L66 52 M90 41 C94 41 99 42 101 46 L99 56 L94 52 M64 34 C62 28 66 22 74 19 M96 34 C98 28 94 22 86 19 M80 22 L80 12 M80 12 L74 5 M80 12 L86 5 M74 5 L80 9 L86 5 M72 45 L88 45 M72 49 C74 52 86 52 88 49"/>',
      },
      armor: {
        color: '#c48a60',
        delay: 0.35,
        svg: '<path d="M63 54 L97 54 L100 74 L98 104 L62 104 L60 74 Z M80 54 L80 104 M61 70 L99 70 M60.4 88 L99.6 88 M62 104 L98 104 L102 118 L58 118 Z M71 118 L69 128 M89 118 L91 128 M45 53 L68 53 L67 70 L43 70 Z M44 58 L67.6 58 M43.6 64 L67.3 64 M115 53 L92 53 L93 70 L117 70 Z M116 58 L92.4 58 M116.4 64 L92.7 64 M44 70 L48 86 L58 86 L62 72 M116 70 L112 86 L102 86 L98 72"/>',
      },
      legs: {
        color: '#7fb5c4',
        delay: 0.7,
        svg: '<path d="M58 118 L102 118 L108 150 L52 150 Z M66 118 L62 150 M80 118 L80 150 M94 118 L98 150 M54 150 L56 208 L76 208 L80 158 M106 150 L104 208 L84 208 L80 158 M50 211 L77 211 M83 211 L110 211 M55 176 L77 176 M83 176 L105 176"/>',
      },
      blade: {
        color: '#bfe3ee',
        delay: 1.05,
        svg: '<path d="M50 92 C52 88 56 86 60 88 L66 94 L58 100 L52 98 Z M110 92 C108 88 104 86 100 88 L94 94 L102 100 L108 98 Z M80 92 L80 124 M76.6 96 L83.4 100 M76.6 103 L83.4 107 M76.6 110 L83.4 114 M76.6 117 L83.4 121 M78.4 132 L78.9 172 L80 184 L81.1 172 L81.6 132 Z"/><path d="M62 94 C68 92 74 92 78 94 M98 94 C92 92 86 92 82 94"/><ellipse cx="80" cy="128" rx="10" ry="3.2"/><circle cx="80" cy="92" r="2.6"/>',
      },
    },
  },
};
