import type { ThemeDefinition } from '../types';

/** Simple: a plain, calm dashboard. Light neutrals with a soft sage-green primary. */
export const simple: ThemeDefinition = {
  id: 'simple',
  name: 'Simple',
  deep: '#f4f6f3',
  fonts: 'family=Inter:wght@400;500;600;700',
  swatches: ['#7fa08c', '#7d93a8', '#f4f6f3'],
  variants: { meter: 'led', moodFace: 'line' },
  hero: {
    name: 'Athlete',
    eyes: 'M74 40 L76 40 M84 40 L86 40',
    slotNames: { helm: 'Cap', armor: 'Shirt', legs: 'Shoes', blade: 'Dumbbell' },
    pieces: {
      helm: {
        color: '#557f68',
        delay: 0,
        svg: '<path d="M80 24 C87 24 91 30 91 37 C91 45 86 51 80 51 C74 51 69 45 69 37 C69 30 73 24 80 24 Z M68 32 C69 24 74 19 80 19 C86 19 91 24 92 32 Z M92 32 L103 34 L92 35 M74 45 C77 47 83 47 86 45"/>',
      },
      armor: {
        color: '#7fa08c',
        delay: 0.35,
        svg: '<path d="M76 51 L76 56 M84 51 L84 56 M62 60 L75 56 C77 59 83 59 85 56 L98 60 L108 78 L100 82 L96 74 L96 108 L64 108 L64 74 L60 82 L52 78 Z M54 80 L50 104 M106 80 L110 104 M64 92 L96 92"/>',
      },
      legs: {
        color: '#7d93a8',
        delay: 0.7,
        svg: '<path d="M64 108 L96 108 L98 140 L83 140 L80 124 L77 140 L62 140 Z M64 140 L65 196 M77 140 L75 196 M83 140 L85 196 M96 140 L95 196 M60 196 L76 196 L78 205 L55 205 C55 200 57 197 60 196 Z M84 196 L100 196 C103 197 105 200 105 205 L82 205 Z"/>',
      },
      blade: {
        color: '#5f6b64',
        delay: 1.05,
        svg: '<path d="M100 110 L126 110 M100 101 L100 119 M104 103 L104 117 M122 103 L122 117 M126 101 L126 119 M108 106 C110 104 112 104 113 106 L113 114 C112 116 110 116 108 114"/>',
      },
    },
  },
};
