/*
 * SVG art, ported from the original HeroArc page. These build SVG markup strings from
 * trusted constants and numbers only (never user text), and are rendered with
 * dangerouslySetInnerHTML where the original set innerHTML, so the DOM matches exactly.
 */
import type { GearSlot, ThemeDefinition } from '../../themes/types';

export const HERO_SLOTS: readonly GearSlot[] = ['helm', 'armor', 'legs', 'blade'];

export type HeroFill = Record<GearSlot | 'aura', number>;

/** The animated hero figure (original heroSVG). `fill` is 0..1 per slot plus aura. */
export function heroSvg(fill: HeroFill, hero: ThemeDefinition['hero'], uid = 'h'): string {
  const st = (f: number) => (f >= 1 ? 'lit' : f > 0 ? 'part' : 'off');
  const full = HERO_SLOTS.every((k) => (fill[k] || 0) >= 1) && (fill.aura || 0) >= 1;
  const defs =
    HERO_SLOTS.map((k) => `<g id="${uid}P_${k}">${hero.pieces[k].svg}</g>`).join('') +
    `<g id="${uid}P_eyes"><path d="${hero.eyes}"/></g>` +
    `<filter id="${uid}gl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.6"/></filter>` +
    `<linearGradient id="${uid}sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8f6ff" stop-opacity="0"/><stop offset=".5" stop-color="#e8f6ff" stop-opacity=".95"/><stop offset="1" stop-color="#e8f6ff" stop-opacity="0"/></linearGradient>`;
  const lit = HERO_SLOTS.filter((k) => (fill[k] || 0) > 0);
  const mask = `<mask id="${uid}mk" maskUnits="userSpaceOnUse" x="-8" y="0" width="176" height="230"><g style="fill:none;stroke:#fff;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round">${lit.map((k) => `<use href="#${uid}P_${k}"/>`).join('')}</g></mask>`;
  const piece = (k: GearSlot) => {
    const f = fill[k] || 0;
    const p = hero.pieces[k];
    return `<g class="pc ${k} ${st(f)}" style="--c:${p.color};--f:${f.toFixed(2)};--d:${p.delay}s"><use class="gw" href="#${uid}P_${k}" filter="url(#${uid}gl)"/><use class="ln" href="#${uid}P_${k}"/></g>`;
  };
  const au = fill.aura || 0;
  const pt = (x: number, b: number) =>
    `<circle r="1.3" cx="${x}" cy="210"><animate attributeName="cy" values="212;24" dur="5.5s" begin="${b}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.95;0" dur="5.5s" begin="${b}s" repeatCount="indefinite"/></circle>`;
  const ripples =
    au > 0
      ? ['0', '1.6']
          .map(
            (b) =>
              `<ellipse class="rp" cx="80" cy="219" rx="10" ry="2"><animate attributeName="rx" values="10;66" dur="3.2s" begin="${b}s" repeatCount="indefinite"/><animate attributeName="ry" values="2;7.5" dur="3.2s" begin="${b}s" repeatCount="indefinite"/><animate attributeName="opacity" values=".75;0" dur="3.2s" begin="${b}s" repeatCount="indefinite"/></ellipse>`,
          )
          .join('')
      : '';
  const aura = `<g class="au ${st(au)}" style="--f:${au.toFixed(2)}"><circle class="a1" cx="80" cy="122" r="84"/><circle class="a2" cx="80" cy="122" r="75"><animateTransform attributeName="transform" type="rotate" from="0 80 122" to="360 80 122" dur="38s" repeatCount="indefinite"/></circle><ellipse class="a3" cx="80" cy="219" rx="60" ry="6.5"/>${au > 0 ? `<g class="pt">${pt(40, 0)}${pt(120, 1.7)}${pt(62, 3.1)}${pt(100, 4.2)}${pt(80, 2.4)}${pt(52, 5)}</g>` : ''}${ripples}</g>`;
  const scan = lit.length
    ? `<rect class="sc" mask="url(#${uid}mk)" x="-8" y="-40" width="176" height="40" fill="url(#${uid}sg)"><animate attributeName="y" values="-40;230" dur="${full ? '2.6' : '4.4'}s" repeatCount="indefinite"/></rect>`
    : '';
  const eyes = `<use class="eyes ${(fill.helm || 0) > 0 ? 'on' : ''}" href="#${uid}P_eyes"/>`;
  return `<svg viewBox="-8 0 176 230" class="hs${full ? ' full' : ''}" role="img" aria-label="${hero.name} figure showing weekly progress"><defs>${defs}${mask}</defs>${aura}<g class="fig">${(['legs', 'blade', 'armor', 'helm'] as const).map(piece).join('')}${eyes}</g>${scan}</svg>`;
}

/** Simple line face for mood 1–5 (original mdFace). */
export function moodFaceSvg(m: number): string {
  const mouth = {
    1: 'M9 21 Q14 15 19 21',
    2: 'M9 20 Q14 17 19 20',
    3: 'M9 19 L19 19',
    4: 'M9 18 Q14 21 19 18',
    5: 'M8 17 Q14 24 20 17',
  }[m];
  return `<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="11"/><circle class="e" cx="10.5" cy="11.5" r="1.5"/><circle class="e" cx="17.5" cy="11.5" r="1.5"/><path d="${mouth}"/></svg>`;
}

/** Engraved face for the Alchemist theme (original alFace). */
export function alchemistFaceSvg(m: number, cls = ''): string {
  const faces: Record<number, { b: number; eye: string; mo: string; ch: number; cr: string }> = {
    1: {
      b: -1.6,
      eye: 'M9.5 12.2 Q11.5 13.2 13.5 12.2 M16.5 12.2 Q18.5 13.2 20.5 12.2',
      mo: 'M11 21.5 Q15 18.6 19 21.5',
      ch: 3,
      cr: 'M8 6.5 Q15 1 22 6.5 M10 5.2 L11 3 M15 4.2 L15 2 M20 5.2 L19 3',
    },
    2: {
      b: -0.8,
      eye: 'M9.5 12.4 Q11.5 13.4 13.5 12.4 M16.5 12.4 Q18.5 13.4 20.5 12.4',
      mo: 'M11.5 21 Q15 19.4 18.5 21',
      ch: 2,
      cr: '',
    },
    3: {
      b: 0,
      eye: 'M9.5 12.6 Q11.5 11.4 13.5 12.6 M16.5 12.6 Q18.5 11.4 20.5 12.6',
      mo: 'M11.5 20.4 L18.5 20.4',
      ch: 1,
      cr: '',
    },
    4: {
      b: 0.5,
      eye: 'M9.5 12.6 Q11.5 11 13.5 12.6 M16.5 12.6 Q18.5 11 20.5 12.6',
      mo: 'M11 19.6 Q15 22 19 19.6',
      ch: 1,
      cr: '',
    },
    5: {
      b: 1,
      eye: 'M9.5 12.8 Q11.5 10.6 13.5 12.8 M16.5 12.8 Q18.5 10.6 20.5 12.8',
      mo: 'M10.5 19.2 Q15 23.4 19.5 19.2',
      ch: 0,
      cr: 'M15 .8 L15 3 M5.5 4 L7.2 5.6 M24.5 4 L22.8 5.6 M2 11 L4.4 11.2 M28 11 L25.6 11.2',
    },
  };
  const e = faces[m] ?? faces[3];
  if (!e) return '';
  let hatch = '';
  for (let i = 0; i < e.ch; i++) {
    const y = 14.6 + i * 1.5;
    hatch += `M7.4 ${y} L11 ${y + 1.6} M23 ${y} L19.2 ${y + 1.6}`;
  }
  const brow = `M9 ${9.6 + e.b * 0.5} Q11.5 ${8.2 + e.b * 0.3} 14 ${9.4 + e.b * 0.6} M16 ${9.4 + e.b * 0.6} Q18.5 ${8.2 + e.b * 0.3} 21 ${9.6 + e.b * 0.5}`;
  const shade = 'M6.2 17 Q6.6 22 11 25 M24 17 Q23.4 22 19 25 M8 8.6 Q15 4.6 22 8.6';
  return `<svg viewBox="0 0 30 30" aria-hidden="true" class="${cls}" style="fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round"><circle cx="15" cy="15" r="10.6" stroke-width="1.5"/><circle cx="15" cy="15.3" r="9.2" stroke-width=".55" opacity=".7" stroke-dasharray="14 1.2 9 .9 22 1.1"/><path d="${shade}" stroke-width=".7" opacity=".75"/><path d="${hatch}" stroke-width=".65" opacity=".8"/><path d="${brow}" stroke-width="1.5"/><path d="${e.eye}" stroke-width="1.15"/><path d="M15 13.2 L14.1 17.2 L16 17.2" stroke-width=".85"/><path d="${e.mo}" stroke-width="1.25"/>${e.cr ? `<path d="${e.cr}" stroke-width="1"/>` : ''}</svg>`;
}

/** Deterministic pseudo-random sequence (original alRng). */
function alRng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Hand-drawn meter for the Alchemist theme (original alMeter). */
export function alchemistMeterSvg(fraction: number, seed: number): string {
  const r = alRng(seed + 7);
  const W = 100;
  const Y = 12;
  const n = Math.max(0, Math.min(1, fraction));
  let base = `M1 ${Y}`;
  let x = 1;
  while (x < W - 1) {
    x += 9 + r() * 4;
    if (x > W - 1) x = W - 1;
    base += ` L${x.toFixed(1)} ${(Y + (r() - 0.5) * 1.3).toFixed(1)}`;
  }
  let tk = '';
  for (let i = 0; i <= 10; i++) {
    const tx = 1 + (i * (W - 2)) / 10;
    const tall = i % 5 === 0;
    tk += `M${(tx + (r() - 0.5) * 0.6).toFixed(1)} ${Y + 1} L${(tx + (r() - 0.5) * 0.6).toFixed(1)} ${(Y + (tall ? 7 : 4.5)).toFixed(1)}`;
  }
  const end = 1 + n * (W - 2);
  let hs = '';
  let hr = '';
  if (n > 0.01) {
    for (let px = 2; px <= end; px += 3.1) {
      const x1 = px + (r() - 0.5) * 0.8;
      const top = 2 + r() * 1.4;
      const bot = Y - 0.5 - r() * 0.8;
      const s = `M${(x1 - 1.6).toFixed(1)} ${bot.toFixed(1)} L${(x1 + 1.6).toFixed(1)} ${top.toFixed(1)} `;
      if (px / (W - 2) > 0.86) hr += s;
      else hs += s;
    }
    hs += `M1 ${Y - 1} L${end.toFixed(1)} ${(Y - 1.2).toFixed(1)}`;
  }
  return `<svg class="alm" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><path class="base" d="${base}"/><path class="tk" d="${tk}"/><path class="h" d="${hs}"/><path class="h hr" d="${hr}"/></svg>`;
}
