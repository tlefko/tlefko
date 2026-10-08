/**
 * The Kaboom Bomb (symbol 11): a black cast-iron cannonball bomb with a painted skull and
 * crossbones, a riveted brass fuse cap and a lit fuse. `idle` = fuse burning; `hot` = about to
 * blow (red-hot iron, glowing cracks, the fuse burnt to a stub). 256 viewBox, same framing in
 * every frame; the game scales the sprite for bomb size and draws the size / fuse badges.
 *
 * Read apart from the Powder Keg at a glance: round black iron with cool steel light (the keg
 * is a tall brown barrel with gold hoops), a bone-white skull (the keg's is a red stencil) and a
 * short brass-capped fuse at the top right.
 */
import { type V, lens, sparkle, turn } from './geo';
import { C, composeSymbol, celForm, GOLD_TONES, shine, cord, mix, softGlow, glowOf } from './kit';
import { skullAndBones } from './captain';

const CX = 122;
const CY = 148;
const R = 84;
const SPHERE = `M${CX - R} ${CY} A${R} ${R} 0 1 0 ${CX + R} ${CY} A${R} ${R} 0 1 0 ${CX - R} ${CY} Z`;
/** Where the brass cap sits on the sphere (upper right) and its tilt. */
const CAP_AT: V = [167, 79];
const CAP_TILT = 30;
/** The fuse leaves the cap's mouth and curls up to the right; hot, it has burnt down to a stub. */
const MOUTH = turn([CAP_AT[0], CAP_AT[1] - 18], CAP_TILT, CAP_AT);
const FUSE_LIT: V[] = [MOUTH, [MOUTH[0] + 9, MOUTH[1] - 11], [MOUTH[0] + 6, MOUTH[1] - 22], [MOUTH[0] + 15, MOUTH[1] - 30], [MOUTH[0] + 28, MOUTH[1] - 31]];
const FUSE_HOT: V[] = [MOUTH, [MOUTH[0] + 7, MOUTH[1] - 8], [MOUTH[0] + 10, MOUTH[1] - 16]];
/**
 * Where the fuse spark sits, in 256 viewBox units (for sparks / particles placed in the engine):
 * `lit` for idle, `hot` for the burnt-down stub.
 */
export const BOMB_FUSE_TIP: { lit: V; hot: V } = { lit: FUSE_LIT[FUSE_LIT.length - 1], hot: FUSE_HOT[FUSE_HOT.length - 1] };

/** Spark star at `at`: `k` scales it, `spin` turns the points, `hot` makes it bigger and whiter. */
function spark(at: V, k: number, spin: number, hot: boolean): string {
  const pts = (r0: number, r1: number, n: number) =>
    Array.from({ length: n * 2 }, (_, i) => {
      const a = ((i / (n * 2)) * 360 + spin) * (Math.PI / 180);
      const r = i % 2 ? r0 : r1 * (i % 4 === 0 ? 1 : 0.8);
      return `${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
    }).join(' L');
  const embers: [number, number, number][] = hot
    ? [[-30, -18, 3.4], [28, -26, 3], [32, 20, 2.6], [-24, 26, 2.4], [4, -36, 2.4]]
    : [[-26, -14, 2.8], [24, -22, 2.4], [26, 18, 2]];
  return `<g transform="translate(${at[0]} ${at[1]}) scale(${k})">
    ${softGlow(0, 0, hot ? 30 : 24, C.fireHot, hot ? 0.85 : 0.7)}
    <path d="M${pts(8, 26, 6)} Z" fill="${C.fireHot}" stroke="${C.ink}" stroke-width="${(3 / k).toFixed(2)}" stroke-linejoin="round"/>
    <path d="M${pts(4, 13, 6)} Z" fill="${C.fireCore}"/>
    <circle r="4.5" fill="#fff"/>
    ${embers.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.fireCore}"/>`).join('')}
  </g>`;
}

interface BombPose {
  hot: boolean;
  /** Spark flicker: size and spin (idle frames vary these). */
  flick?: number;
  spin?: number;
  /** Crack glow strength when hot (0..1). */
  heat?: number;
}

function bombArt(p: BombPose): string {
  const hot = p.hot;
  const heat = p.heat ?? 1;
  // cast iron: near-black with cool steel light; red-hot iron shifts to embers
  const IRON = hot
    ? { base: mix(C.ember, C.inkSoft, 0.35), shade: mix(C.ink, C.ember, 0.3), light: mix(C.fireDeep, C.fire, 0.35), hatch: mix(C.ember, C.ink, 0.55) }
    : { base: mix(C.inkSoft, C.navy, 0.32), shade: C.ink, light: mix(C.steelDeep, C.navyLight, 0.3), hatch: mix(C.steelDeep, C.navy, 0.5) };
  // cast pits in the iron: tiny dents catching a rim of light
  const pits = ([
    [78, 108, 3.2],
    [168, 198, 3.6],
    [150, 116, 2.4],
    [70, 176, 2.6],
    [188, 150, 2.2],
  ] as const)
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${IRON.shade}"/><path d="M${x - r * 0.4} ${y + r * 0.9} A${r} ${r} 0 0 0 ${x + r * 0.9} ${y - r * 0.4}" stroke="${IRON.light}" stroke-width="1.4" fill="none"/>`)
    .join('');
  const sphere = celForm(SPHERE, { ...IRON, cut: [-20, -22], shrink: 0.97, band: [7, 8], hatch: IRON.hatch, hatchGap: 5.5, seed: 81, inner: pits });

  // brass fuse cap: a short riveted collar standing out of the ball along its radius
  const capT = `translate(${CAP_AT[0]} ${CAP_AT[1]}) rotate(${CAP_TILT})`;
  const capBody = 'M-21 9 L-21 -18 A21 7 0 0 1 21 -18 L21 9 A21 7 0 0 1 -21 9 Z';
  const capTop = 'M-21 -18 A21 7 0 1 0 21 -18 A21 7 0 1 0 -21 -18 Z';
  const capG = hot ? { base: C.fireHot, shade: C.fire, light: C.fireCore, hatch: C.fireDeep } : GOLD_TONES;
  const cap = celForm(capBody, {
    ...capG,
    t: capT,
    cut: [-7, -3],
    band: [3, 1],
    seed: 82,
    inner: `<path d="M-21 -5 A21 7 0 0 0 21 -5" transform="${capT}" fill="none" stroke="${hot ? C.fireDeep : C.goldDeep}" stroke-width="3.4"/><path d="M-21 3 A21 7 0 0 0 21 3" transform="${capT}" fill="none" stroke="${hot ? C.fireDeep : C.goldDeep}" stroke-width="2" opacity=".7"/>`,
  });
  const top = celForm(capTop, { base: hot ? C.fireCore : C.goldLight, shade: capG.base, t: capT, cut: [-3, -2], seed: 83, inner: `<ellipse cx="0" cy="-18" rx="8" ry="3" transform="${capT}" fill="${C.inkSoft}"/>` });
  const rivet = (v: V) => {
    const q = turn([CAP_AT[0] + v[0], CAP_AT[1] + v[1]], CAP_TILT, CAP_AT);
    return `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="2.8" fill="${hot ? C.fireCore : C.goldLight}" stroke="${C.ink}" stroke-width="1.6"/>`;
  };
  // fuse: out of the cap, a short curl up to the right; hot = burnt down to a stub
  const fusePts = hot ? FUSE_HOT : FUSE_LIT;
  const tip = hot ? BOMB_FUSE_TIP.hot : BOMB_FUSE_TIP.lit;
  const fuse = cord(fusePts, 3.4, { core: hot ? C.ember : C.woodLight, lit: hot ? C.fireDeep : C.paperWarm, twist: hot ? C.ink : C.woodMid, ink: 6 });

  // red-hot: jagged cracks glowing from inside the iron
  // cracks run round the painted skull, never across its face
  const cracks: V[][] = [
    [[62, 112], [78, 118], [82, 132], [72, 144]],
    [[150, 92], [145, 108], [158, 118], [156, 132]],
    [[194, 162], [180, 174], [186, 190], [172, 204]],
    [[94, 216], [106, 220], [112, 230]],
  ];
  const crackD = cracks.map((c) => `M${c.map((q) => `${q[0]} ${q[1]}`).join(' L')}`).join(' ');
  const crackArt = hot
    ? `<path d="${crackD}" fill="none" stroke="${C.fire}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" opacity="${(0.28 * heat).toFixed(2)}"/>
       <path d="${crackD}" fill="none" stroke="${C.ink}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
       <path d="${crackD}" fill="none" stroke="${heat > 0.7 ? C.fireCore : C.fireHot}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`
    : '';
  const skull = hot
    ? `${skullAndBones(116, 160, 58, mix(C.paperWarm, C.fireHot, 0.35), true)}`
    : skullAndBones(116, 160, 58, C.paper, true);
  const chips = hot ? '' : `<g fill="${IRON.base}"><circle cx="100" cy="146" r="1.8"/><circle cx="131" cy="171" r="1.5"/><circle cx="92" cy="182" r="1.4"/></g>`;
  return composeSymbol({
    autoCel: false,
    texture: { seed: 21, mottle: 0.55 },
    contour: 0.8,
    inkShift: [1, 1.2],
    under: hot ? glowOf(`<circle cx="${CX}" cy="${CY}" r="${R + 4}" fill="none" stroke="${C.fire}" stroke-width="10"/>`, 5, 0.55 + 0.35 * heat) : '',
    layers: [
      { fills: sphere.fills, lines: sphere.line() },
      { fills: cap.fills + top.fills, lines: `${cap.line('stroke-width="5.5"')}${top.line('stroke-width="4.5"')}` },
    ],
    top: `
      ${rivet([-13, -1])}${rivet([0, 1])}${rivet([13, -1])}
      ${skull}${chips}
      ${crackArt}
      ${fuse}
      ${spark(tip, (hot ? 1.18 : 0.92) * (p.flick ?? 1), p.spin ?? 0, hot)}
      ${hot ? shine([[196, 170], [184, 204], [156, 226]], 3.8, 0.85, C.fireHot) : shine([[196, 168], [186, 200], [160, 224]], 3.2, 0.55, C.moonGlow)}
      ${shine([[58, 134], [64, 106], [84, 83], [110, 72]], 6.5, hot ? 0.45 : 0.85, hot ? C.fireCore : C.steelLight)}
      <path d="${lens([[74, 150], [76, 136], [82, 124]], 3)}" fill="${hot ? C.fireCore : C.white}" opacity=".75"/>
      <circle cx="116" cy="74" r="3.4" fill="${hot ? C.fireCore : C.white}" opacity=".85"/>
      ${hot ? sparkle(206, 196, 8, C.fireCore, 0.9) : ''}`,
  });
}

/** Kaboom Bomb, fuse lit. */
export const bombIdle = (): string => bombArt({ hot: false });
/** Kaboom Bomb about to blow: red-hot iron and glowing cracks. */
export const bombHot = (): string => bombArt({ hot: true });
/** Fuse flicker for the idle bomb (optional: loop while it sits on the board). */
export const bombIdleFrames: (() => string)[] = [
  () => bombArt({ hot: false, flick: 1, spin: 0 }),
  () => bombArt({ hot: false, flick: 1.1, spin: 16 }),
  () => bombArt({ hot: false, flick: 0.9, spin: 34 }),
];
/** Heat pulse for the hot bomb (optional: loop while it counts down). */
export const bombHotFrames: (() => string)[] = [
  () => bombArt({ hot: true, heat: 1, flick: 1, spin: 0 }),
  () => bombArt({ hot: true, heat: 0.6, flick: 1.12, spin: 20 }),
];
