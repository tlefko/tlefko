/**
 * High-pay symbols: the cove's crew of critters. Crab (orange), octopus with an eye patch
 * (violet), shark with a gold earring (steel blue) and Sparks the parrot (green). Each has
 * idle, blink and win frames; the parrot head is also used by the Sparks rig.
 */
import { C, composeSymbol, pieEye, closedEye, nextId, brow, cel, celForm, celTones, shine, mix, scallops } from './kit';
import { type V, P, taper, sparkle, lens, mirrorX } from './geo';

export type Pose = 'idle' | 'blink' | 'win';

const flip = (pts: V[]): V[] => pts.map(([x, y]) => [256 - x, y]);

/** Toothy open mouth: dark inside, a white teeth band on top and a tongue, all clipped. */
function mouth(path: string, teethY: number, tongue: [number, number, number, number]) {
  const id = nextId('mo');
  return `<clipPath id="${id}"><path d="${path}"/></clipPath>
    <path d="${path}" fill="${C.crimsonDeep}"/>
    <g clip-path="url(#${id})">
      <ellipse cx="${tongue[0]}" cy="${tongue[1]}" rx="${tongue[2]}" ry="${tongue[3]}" fill="${C.crimson}"/>
      <ellipse cx="${tongue[0] - tongue[2] * 0.3}" cy="${tongue[1] - tongue[3] * 0.35}" rx="${tongue[2] * 0.3}" ry="${tongue[3] * 0.22}" fill="${C.crimsonLight}" opacity=".7"/>
      <rect x="0" y="0" width="256" height="${teethY}" fill="${C.white}"/>
      <path d="M0 ${teethY} L256 ${teethY}" stroke="${C.ink}" stroke-width="4"/>
    </g>
    <path d="${path}" fill="none" stroke="${C.ink}" stroke-width="7" stroke-linejoin="round"/>`;
}

/* ------------------------------------------------------------------ */
/* Shared cel painting for the critters                                */
/* ------------------------------------------------------------------ */
const tones = celTones;

/** An eye white with a cel crescent (paper, never pure white) and its ink ring. */
function eyeWhite(cx: number, cy: number, rx: number, ry: number, sw = 6.5): string {
  const d = `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
  return `${cel(d, { base: C.white, shade: C.paperWarm, cut: [-rx * 0.28, -ry * 0.3] })}<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="${sw}"/>`;
}


/* ------------------------------------------------------------------ */
/* H4: the crab (orange)                                               */
/* ------------------------------------------------------------------ */
interface CrabPose {
  eyes: 'open' | 'blink' | 'happy' | 'wide';
  mouth: 'grin' | 'laugh' | 'chomp';
  /** Dactyl opening in degrees per claw (0 = shut). */
  open: [number, number];
  /** Extra outward tilt of each claw (degrees) and lift (units). */
  tilt: [number, number];
  lift: [number, number];
  /** Body squash (1 = rest, < 1 squashed down on the snap). */
  squash?: number;
  /** Snap burst at the claw tips. */
  snap?: [boolean, boolean];
}

const CRAB_BODY =
  'M128 97 C160 97 190 101 208 113 L231 110 L221 128 L237 136 L223 149 C222 190 186 219 128 219 C70 219 34 190 33 149 L19 136 L35 128 L25 110 L48 113 C66 101 96 97 128 97 Z';
/** Left claw, local space: wrist at the origin, pincer pointing up, outer side at -x. */
const CLAW_PALM =
  'M12 2 C0 6 -18 2 -27 -16 C-37 -38 -35 -62 -27 -80 C-23 -92 -19 -104 -12 -117 C-5 -107 -3 -96 -3 -86 Q-3 -78 3 -76 C11 -74 21 -68 23 -54 C27 -36 23 -10 12 2 Z';
const CLAW_FINGER = 'M1 -76 C-1 -90 -4 -104 -10 -115 C1 -111 15 -97 19 -80 C20 -74 15 -69 8 -69 Z';
const CLAW_HINGE: V = [7, -73];
/** Dark pincer tips (clipped inside palm and finger). */
const CLAW_TIP_PALM = 'M-30 -97 L-3 -101 L-3 -130 L-30 -130 Z';
const CLAW_TIP_FINGER = 'M-20 -100 L24 -94 L24 -130 L-20 -130 Z';

function crabArt(p: CrabPose): string {
  const T = tones(C.crab, C.crabDeep, C.crabLight);
  const sq = p.squash ?? 1;
  // squash about the base of the body so the crab stays planted on its legs
  const bodyT = sq === 1 ? '' : `translate(128 219) scale(${(2 - sq).toFixed(3)} ${sq.toFixed(3)}) translate(-128 -219)`;
  const bx = (x: number) => 128 + (x - 128) * (2 - sq);
  const by = (y: number) => 219 + (y - 219) * sq;
  const g = (s: string) => (bodyT ? `<g transform="${bodyT}">${s}</g>` : s);

  // legs: jointed, tapering to points, tucked behind the shell
  const legPts: V[][] = [
    [[76, 194], [52, 202], [36, 215], [30, 235]],
    [[98, 206], [86, 219], [80, 233], [80, 247]],
  ];
  const legs = [...legPts, ...legPts.map(flip)].map((pts, i) =>
    celForm(taper(pts, 12, 3.6, 14).d, { base: mix(C.crab, C.crabDeep, 0.3), shade: T.shade, cut: [-5, -6], seed: 40 + i }),
  );

  // eye stalks
  const lift = p.eyes === 'wide' ? 5 : 0;
  const eyeL: V = [bx(102), by(56) - lift];
  const eyeR: V = [bx(154), by(56) - lift];
  const stalk = (base: V, eye: V) =>
    celForm(taper([base, [base[0] + (eye[0] - base[0]) * 0.5 - 2, base[1] + (eye[1] - base[1]) * 0.55], [eye[0], eye[1] + 14]], 8, 6, 12).d, { ...T, cut: [-3, -2], seed: 20 });
  const stalks = [stalk([bx(113), by(106)], eyeL), stalk([bx(143), by(106)], eyeR)];

  // claws: palm with the fixed finger, and the hinged finger that snaps. The right claw is
  // mirrored in its path data so the light still falls from the upper left.
  const tiltOf = (side: 0 | 1) => -7 - p.tilt[side];
  const clawT = (side: 0 | 1) => `translate(${side ? 206 : 50} ${152 - p.lift[side]}) rotate(${side ? -tiltOf(1) : tiltOf(0)}) scale(.97)`;
  const hinge = (side: 0 | 1): V => [side ? -CLAW_HINGE[0] : CLAW_HINGE[0], CLAW_HINGE[1]];
  const fingerT = (side: 0 | 1) => `${clawT(side)} rotate(${side ? -p.open[1] : p.open[0]} ${hinge(side)[0]} ${hinge(side)[1]})`;
  const m0 = (d: string, side: 0 | 1) => (side ? mirrorX(d, 0) : d);
  const clawPt = (side: 0 | 1, v: V): V => {
    const a = ((side ? -tiltOf(1) : tiltOf(0)) * Math.PI) / 180;
    const x = (side ? -v[0] : v[0]) * 0.97;
    const y = v[1] * 0.97;
    return [(side ? 206 : 50) + x * Math.cos(a) - y * Math.sin(a), 152 - p.lift[side] + x * Math.sin(a) + y * Math.cos(a)];
  };
  const tipInk = mix(C.crabDeep, C.ink, 0.3);
  const palms = ([0, 1] as const).map((side) =>
    celForm(m0(CLAW_PALM, side), {
      ...T,
      t: clawT(side),
      cut: [-8, -10],
      hatch: T.hatch,
      seed: 11 + side,
      inner: `<path d="${m0(CLAW_TIP_PALM, side)}" transform="${clawT(side)}" fill="${tipInk}"/>`,
    }),
  );
  const fingers = ([0, 1] as const).map((side) =>
    celForm(m0(CLAW_FINGER, side), { ...T, t: fingerT(side), cut: [-6, -7], seed: 13 + side, inner: `<path d="${m0(CLAW_TIP_FINGER, side)}" transform="${fingerT(side)}" fill="${tipInk}"/>` }),
  );
  const clawShine = (side: 0 | 1) => {
    const pts: V[] = side ? [[-14, -22], [-17, -38], [-15, -52]] : [[-24, -30], [-27, -50], [-23, -71]];
    return shine(pts.map((v) => clawPt(side, [side ? -v[0] : v[0], v[1]])), side ? 2.4 : 3.3, side ? 0.5 : 0.72);
  };
  const snapMark = (side: 0 | 1) => {
    if (!p.snap?.[side]) return '';
    const c = clawPt(side, [-7, -113]);
    const up = clawPt(side, [-7, -150]);
    const al = Math.hypot(up[0] - c[0], up[1] - c[1]);
    const ux = (up[0] - c[0]) / al;
    const uy = (up[1] - c[1]) / al;
    return (side === 0 ? [-5, 40, 85] : [5, -40, -85])
      .map((deg) => {
        const r = (deg * Math.PI) / 180;
        const dx = ux * Math.cos(r) - uy * Math.sin(r);
        const dy = ux * Math.sin(r) + uy * Math.cos(r);
        return `<path d="${lens([[c[0] + dx * 9, c[1] + dy * 9], [c[0] + dx * 27, c[1] + dy * 27]], 4.2)}" fill="${C.fireCore}" stroke="${C.ink}" stroke-width="2.8" stroke-linejoin="round"/>`;
      })
      .join('');
  };

  const eyes = (() => {
    if (p.eyes === 'open' || p.eyes === 'wide') {
      const r: [number, number] = p.eyes === 'wide' ? [19, 23] : [18, 22];
      const pr: [number, number] = p.eyes === 'wide' ? [7.5, 11] : [8.5, 12.5];
      return `${eyeWhite(eyeL[0], eyeL[1], r[0], r[1])}${eyeWhite(eyeR[0], eyeR[1], r[0], r[1])}
        ${pieEye(eyeL[0] + 4, eyeL[1] + 5, pr[0], pr[1])}${pieEye(eyeR[0] + 3, eyeR[1] + 5, pr[0], pr[1])}`;
    }
    const lid = (e: V) => cel(`M${e[0] - 18} ${e[1]} A18 22 0 1 0 ${e[0] + 18} ${e[1]} A18 22 0 1 0 ${e[0] - 18} ${e[1]} Z`, { ...T, cut: [-5, -6] });
    const ring = (e: V) => `<ellipse cx="${e[0]}" cy="${e[1]}" rx="18" ry="22" fill="none" stroke="${C.ink}" stroke-width="6.5"/>`;
    const shut =
      p.eyes === 'blink'
        ? closedEye(eyeL[0], eyeL[1] + 4, 24, false) + closedEye(eyeR[0], eyeR[1] + 4, 24, false)
        : closedEye(eyeL[0], eyeL[1] + 2, 26, true) + closedEye(eyeR[0], eyeR[1] + 2, 26, true);
    return `${lid(eyeL)}${lid(eyeR)}${ring(eyeL)}${ring(eyeR)}${shut}`;
  })();
  const m =
    p.mouth === 'laugh'
      ? mouth('M80 142 Q128 160 176 142 Q170 204 128 208 Q86 204 80 142 Z', 162, [128, 204, 30, 16])
      : p.mouth === 'chomp'
        ? mouth('M86 150 Q128 166 170 150 Q164 182 128 186 Q92 182 86 150 Z', 163, [128, 184, 22, 9])
        : mouth('M86 148 Q128 166 170 148 Q166 192 128 196 Q90 192 86 148 Z', 164, [128, 194, 24, 12]);
  // shell bumps: little raised domes catching the light
  const bumps = ([
    [98, 122, 7],
    [158, 118, 8],
    [128, 111, 5],
    [70, 138, 5],
    [188, 136, 5.5],
    [210, 166, 4],
    [46, 168, 4],
  ] as const)
    .map(([x, y, r]) => `<circle cx="${x + 1.3}" cy="${y + 1.7}" r="${r}" fill="${T.shade}"/><circle cx="${x}" cy="${y}" r="${r * 0.86}" fill="${T.light}"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.32}" r="${r * 0.3}" fill="${C.white}" opacity=".8"/>`)
    .join('');
  const body = celForm(CRAB_BODY, { ...T, cut: [-12, -15], twist: -3, hatch: T.hatch, seed: 7 });

  return composeSymbol({
    autoCel: false,
    texture: { seed: 4 },
    contour: 0.8,
    inkShift: [1, 1.2],
    transform: 'translate(128 150) scale(.95) translate(-128 -150)',
    layers: [
      { fills: legs.map((l) => l.fills).join(''), lines: legs.map((l) => l.line('stroke-width="5.5"')).join('') },
      { fills: stalks.map((l) => l.fills).join(''), lines: stalks.map((l) => l.line('stroke-width="5.5"')).join('') },
      { fills: g(body.fills), lines: g(body.line()) },
      { fills: palms.map((l) => l.fills).join(''), lines: palms.map((l) => l.line()).join('') },
      { fills: fingers.map((l) => l.fills).join(''), lines: fingers.map((l) => l.line('stroke-width="6.5"')).join('') },
    ],
    top: `
      ${g(`${bumps}
      ${shine([[80, 121], [94, 113], [110, 108], [124, 106]], 2.8, 0.7)}
      <ellipse cx="66" cy="172" rx="13" ry="8" fill="${C.parrotRed}" opacity=".3"/><ellipse cx="190" cy="172" rx="13" ry="8" fill="${C.parrotRed}" opacity=".3"/>`)}
      ${clawShine(0)}${clawShine(1)}${snapMark(0)}${snapMark(1)}
      ${eyes}${g(m)}`,
  });
}

const CRAB: Record<Pose, CrabPose> = {
  idle: { eyes: 'open', mouth: 'grin', open: [16, 16], tilt: [0, 0], lift: [0, 0] },
  blink: { eyes: 'blink', mouth: 'grin', open: [16, 16], tilt: [0, 0], lift: [0, 0] },
  win: { eyes: 'happy', mouth: 'laugh', open: [30, 30], tilt: [5, 5], lift: [6, 6] },
};

export function crabHead(pose: Pose = 'idle'): string {
  return crabArt(CRAB[pose]);
}

/** Crab win loop: claws open wide, SNAP shut (the body squashes), open again, snap. */
export const crabWinFrames: (() => string)[] = [
  () => crabArt({ eyes: 'wide', mouth: 'laugh', open: [34, 34], tilt: [6, 6], lift: [8, 8] }),
  () => crabArt({ eyes: 'happy', mouth: 'chomp', open: [0, 0], tilt: [3, 3], lift: [2, 2], squash: 0.96, snap: [true, true] }),
  () => crabArt({ eyes: 'wide', mouth: 'laugh', open: [30, 30], tilt: [7, 7], lift: [11, 11] }),
  () => crabArt({ eyes: 'happy', mouth: 'laugh', open: [0, 0], tilt: [5, 5], lift: [4, 4], squash: 0.97, snap: [true, true] }),
];

/* ------------------------------------------------------------------ */
/* H3: the octopus with an eye patch (violet)                          */
/* ------------------------------------------------------------------ */
interface OctoPose {
  eye: 'open' | 'blink' | 'happy' | 'wide';
  mouth: 'smirk' | 'grin' | 'laugh';
  /** Wiggle phase in degrees and strength (0 = the resting curls). */
  phase?: number;
  amp?: number;
  /** Mantle bob: units up (stretch) or down (squash). */
  bob?: number;
}

const OCTO_MANTLE = 'M128 20 C182 20 208 62 206 106 C204 142 178 164 128 164 C78 164 52 142 50 106 C48 62 74 20 128 20 Z';
/** Tentacle rigs (left side): root point and a chain of [length, heading] segments that curl at the tip. */
const OCTO_ARMS: { root: V; segs: [number, number][]; w: number; lag: number }[] = [
  { root: [86, 144], segs: [[34, 152], [32.6, 137.5], [27.2, 107], [22.8, 52], [18.4, -12.5], [16.1, -83], [11.7, -160]], w: 21, lag: 0 },
  { root: [104, 154], segs: [[34.2, 110.6], [26.7, 103], [19.7, 66], [18.1, 6.3], [14.6, -74], [11.2, -153]], w: 19, lag: 1.6 },
];

/** Walk a tentacle chain; the wiggle travels from root to tip and grows toward the tip. */
function armPts(arm: (typeof OCTO_ARMS)[number], phase: number, amp: number): V[] {
  const pts: V[] = [arm.root];
  let p = arm.root;
  const n = arm.segs.length;
  arm.segs.forEach(([len, head], i) => {
    const u = (i + 1) / n;
    const a = head + amp * (0.35 + 0.65 * u) * Math.sin(((phase * Math.PI) / 180) - arm.lag - i * 0.75);
    p = [p[0] + Math.cos((a * Math.PI) / 180) * len, p[1] + Math.sin((a * Math.PI) / 180) * len];
    pts.push(p);
  });
  return pts;
}

function octoArt(p: OctoPose): string {
  const T = tones(C.octo, C.octoDeep, C.octoLight);
  const phase = p.phase ?? 0;
  const amp = p.amp ?? 0;
  const bob = p.bob ?? 0;
  const mT = bob ? `translate(0 ${-bob})` : '';
  const gm = (s: string) => (mT ? `<g transform="${mT}">${s}</g>` : s);
  // left arms wiggle at the phase, right arms half a beat later so the pair ripples
  const arms = OCTO_ARMS.flatMap((arm) => [
    { pts: armPts(arm, phase, amp), w: arm.w, side: -1 },
    { pts: flip(armPts(arm, phase + 180, amp)), w: arm.w, side: 1 },
  ]).map((t, i) => ({ ...t, ...taper(t.pts, t.w, 5, 24), i }));
  // inner arms in front of the outer ones
  const order = [0, 1, 2, 3];
  const armForms = order.map((k) => {
    const t = arms[k];
    return { t, f: celForm(t.d, { ...T, cut: [-6, -7], hatch: T.hatch, hatchGap: 5.5, seed: 30 + k }) };
  });
  const suckers = arms
    .map((t) =>
      t.spine
        .map((q, i) => {
          const u = i / (t.spine.length - 1);
          if (u < 0.28 || u > 0.9 || i % 3) return '';
          const w = t.w + (5 - t.w) * Math.pow(u, 0.9);
          const n = t.norms[i];
          const c: V = [q[0] + n[0] * t.side * w * 0.42, q[1] + n[1] * t.side * w * 0.42];
          const r = w * 0.36;
          return `<circle cx="${(c[0] + 0.8).toFixed(1)}" cy="${(c[1] + 1).toFixed(1)}" r="${(r + 1.2).toFixed(1)}" fill="${T.shade}"/><circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${r.toFixed(1)}" fill="${C.pinkLight}" stroke="${C.octoDeep}" stroke-width="1.8"/><circle cx="${(c[0] + r * 0.12).toFixed(1)}" cy="${(c[1] + r * 0.15).toFixed(1)}" r="${(r * 0.42).toFixed(1)}" fill="${C.pink}" opacity=".7"/>`;
        })
        .join(''),
    )
    .join('');

  const eye: V = [154, 98];
  const eyeArt =
    p.eye === 'open' || p.eye === 'wide'
      ? `${eyeWhite(eye[0], eye[1] - (p.eye === 'wide' ? 2 : 0), p.eye === 'wide' ? 19 : 18, p.eye === 'wide' ? 25 : 23)}${pieEye(eye[0] + 3, eye[1] + 5, p.eye === 'wide' ? 8 : 9, p.eye === 'wide' ? 11.5 : 13)}`
      : p.eye === 'blink'
        ? closedEye(eye[0], eye[1] + 4, 28, false)
        : closedEye(eye[0], eye[1] + 2, 30, true);
  const clip = nextId('oc');
  const patch = `<clipPath id="${clip}"><path d="${OCTO_MANTLE}"/></clipPath>
    <path d="M40 96 L84 96 M110 84 C134 62 162 42 214 30" stroke="${C.ink}" stroke-width="7.5" fill="none" stroke-linecap="round" clip-path="url(#${clip})"/>
    <path d="M78 92 C78 80 92 74 106 78 C120 82 122 100 114 110 C106 120 86 120 80 110 C77 104 78 98 78 92 Z" fill="${C.ink}"/>
    <path d="${lens([[86, 88], [94, 82], [104, 82]], 2.4)}" fill="${C.g4}"/>
    <path d="M84 108 Q96 116 110 108" stroke="${C.g5}" stroke-width="1.6" stroke-dasharray="3 3" fill="none"/>`;
  const up = p.eye === 'wide' ? -4 : 0;
  const browR = p.mouth === 'laugh' ? brow(136, 62 + up, 172, 64 + up, -6, 4.2) : brow(134, 64 + up, 170, 60 + up, -8, 4.2);
  const m =
    p.mouth === 'laugh'
      ? mouth('M94 124 Q128 140 162 124 Q158 158 128 160 Q98 158 94 124 Z', 138, [128, 158, 20, 10])
      : p.mouth === 'grin'
        ? mouth('M98 126 Q128 140 158 124 Q152 150 128 152 Q104 150 98 126 Z', 137, [128, 151, 16, 7])
        : `<path d="M102 130 Q126 144 150 126" stroke="${C.ink}" stroke-width="6.5" fill="none" stroke-linecap="round"/>
         <path d="M148 120 Q154 124 152 132" stroke="${C.ink}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
  // skin: flat darker spots and a few raised, light-catching bumps
  const spots = ([
    [96, 44, 8],
    [166, 50, 6],
    [186, 88, 7],
    [66, 76, 5],
    [124, 34, 4],
    [180, 122, 5],
  ] as const)
    .map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.85}" fill="${T.shade}" opacity=".55"/>`)
    .join('');
  const bumps = ([
    [118, 52, 4.5],
    [150, 32, 5],
    [74, 60, 4],
    [194, 104, 3.6],
  ] as const)
    .map(([x, y, r]) => `<circle cx="${x + 1}" cy="${y + 1.3}" r="${r}" fill="${T.shade}"/><circle cx="${x}" cy="${y}" r="${r * 0.85}" fill="${T.light}"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.28}" fill="${C.white}" opacity=".8"/>`)
    .join('');
  const mantle = celForm(OCTO_MANTLE, { ...T, cut: [-13, -15], twist: -4, hatch: T.hatch, seed: 5, inner: spots, t: mT || undefined });

  return composeSymbol({
    autoCel: false,
    texture: { seed: 5 },
    contour: 0.8,
    inkShift: [1, 1.2],
    transform: 'translate(128 128) scale(.95) translate(-128 -128)',
    layers: [
      { fills: armForms.map((a) => a.f.fills).join(''), lines: armForms.map((a) => a.f.line('stroke-width="6.5"')).join('') },
      { fills: mantle.fills, lines: mantle.line() },
    ],
    top: `
      ${suckers}
      ${gm(`${bumps}
      ${shine([[64, 78], [72, 56], [88, 38], [108, 29]], 3.4, 0.62)}
      <ellipse cx="84" cy="138" rx="12" ry="7" fill="${C.pinkLight}" opacity=".4"/><ellipse cx="176" cy="134" rx="12" ry="7" fill="${C.pinkLight}" opacity=".4"/>
      ${patch}${eyeArt}${browR}${m}`)}`,
  });
}

const OCTO: Record<Pose, OctoPose> = {
  idle: { eye: 'open', mouth: 'smirk' },
  blink: { eye: 'blink', mouth: 'smirk' },
  win: { eye: 'happy', mouth: 'laugh', phase: 0, amp: 10 },
};

export function octoHead(pose: Pose = 'idle'): string {
  return octoArt(OCTO[pose]);
}

/** Octopus win loop: the arms ripple through a full wiggle while it laughs and winks. */
export const octoWinFrames: (() => string)[] = [
  () => octoArt({ eye: 'happy', mouth: 'laugh', phase: 0, amp: 14, bob: 2 }),
  () => octoArt({ eye: 'wide', mouth: 'laugh', phase: 90, amp: 14, bob: 4 }),
  () => octoArt({ eye: 'happy', mouth: 'laugh', phase: 180, amp: 14, bob: 2 }),
  () => octoArt({ eye: 'wide', mouth: 'grin', phase: 270, amp: 14, bob: 0 }),
];

/* ------------------------------------------------------------------ */
/* H2: the shark with a gold earring (steel blue)                      */
/* ------------------------------------------------------------------ */
interface SharkPose {
  eyes: 'open' | 'blink' | 'happy' | 'wide';
  jaw: 'grin' | 'wide' | 'mid' | 'shut';
  /** Impact marks at the mouth corners (the chomp). */
  chomp?: boolean;
  /** Head squash on the chomp (1 = rest). */
  squash?: number;
}

type Jaw = { top: [V, V, V]; bot: [V, V, V]; lip: [V, V]; chin: number; tongue: number };
const JAWS: Record<'grin' | 'wide' | 'mid', Jaw> = {
  grin: { top: [[64, 148], [128, 178], [192, 148]], lip: [[184, 202], [128, 206]], bot: [[86, 190], [128, 212], [170, 190]], chin: 214, tongue: 202 },
  mid: { top: [[60, 143], [128, 173], [196, 143]], lip: [[190, 212], [128, 217]], bot: [[84, 200], [128, 224], [172, 200]], chin: 222, tongue: 211 },
  wide: { top: [[56, 138], [128, 168], [200, 138]], lip: [[194, 222], [128, 227]], bot: [[82, 211], [128, 237], [174, 211]], chin: 231, tongue: 220 },
};

const quad = (Q: [V, V, V], t: number): V => {
  const a = (1 - t) * (1 - t);
  const b = 2 * (1 - t) * t;
  const c = t * t;
  return [a * Q[0][0] + b * Q[1][0] + c * Q[2][0], a * Q[0][1] + b * Q[1][1] + c * Q[2][1]];
};
/** A row of triangular teeth along a quadratic curve, pointing along its normal. */
const teethRow = (Q: [V, V, V], n: number, h: number, t0: number, t1: number) => {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = quad(Q, t0 + ((t1 - t0) * i) / n);
    const b = quad(Q, t0 + ((t1 - t0) * (i + 1)) / n);
    const m = quad(Q, t0 + ((t1 - t0) * (i + 0.5)) / n);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const tip: V = [m[0] + (-dy / len) * h, m[1] + (dx / len) * h];
    d += `M${P(a)} L${P(tip)} L${P(b)} Z `;
  }
  return d;
};

function sharkArt(p: SharkPose): string {
  const T = tones(C.shark, C.sharkDeep, C.sharkLight);
  const shut = p.jaw === 'shut';
  const J = p.jaw === 'shut' ? JAWS.grin : JAWS[p.jaw];
  const chin = shut ? 208 : J.chin;
  const sq = p.squash ?? 1;
  const hT = sq === 1 ? '' : `translate(128 ${chin}) scale(${(2 - sq).toFixed(3)} ${sq.toFixed(3)}) translate(-128 ${-chin})`;
  const g = (s: string) => (hT ? `<g transform="${hT}">${s}</g>` : s);
  const head = `M128 58 C184 58 224 98 226 144 C228 ${chin - 26} 188 ${chin} 128 ${chin} C68 ${chin} 28 ${chin - 26} 30 144 C32 98 72 58 128 58 Z`;
  const fin = 'M96 76 C100 46 126 22 172 12 C158 36 154 56 162 80 Z';
  const finL = 'M54 174 C30 184 12 204 14 224 C36 216 56 206 72 194 Z';
  const finR = mirrorX(finL);
  const belly = `M16 ${shut ? 150 : 158} C62 ${shut ? 132 : 138} 194 ${shut ? 132 : 138} 240 ${shut ? 150 : 158} L240 250 L16 250 Z`;
  const bellyClip = nextId('sb');

  let mouthArt = '';
  if (!shut) {
    const mPath = `M${P(J.top[0])} Q${P(J.top[1])} ${P(J.top[2])} Q${P(J.lip[0])} ${P(J.lip[1])} Q${2 * 128 - J.lip[0][0]} ${J.lip[0][1]} ${P(J.top[0])} Z`;
    const top = teethRow(J.top, 9, p.jaw === 'wide' ? 18 : 16, 0.04, 0.96);
    const bot = teethRow([J.bot[2], J.bot[1], J.bot[0]], 6, p.jaw === 'wide' ? 15 : 13, 0, 1);
    const mid = nextId('sm');
    mouthArt = `<clipPath id="${mid}"><path d="${mPath}"/></clipPath>
      <path d="${mPath}" fill="${C.crimsonDeep}"/>
      <g clip-path="url(#${mid})">
        <path d="${mPath}" fill="${mix(C.crimsonDeep, C.ink, 0.45)}" transform="translate(0 -10)"/>
        <ellipse cx="128" cy="${J.tongue}" rx="36" ry="15" fill="${C.crimson}"/>
        <path d="${lens([[108, J.tongue - 7], [122, J.tongue - 10], [138, J.tongue - 9]], 2.6)}" fill="${C.crimsonLight}" opacity=".8"/>
        <path d="${top}" fill="${C.white}" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round"/>
        <path d="${bot}" fill="${C.white}" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round"/>
      </g>
      <path d="${mPath}" fill="none" stroke="${C.ink}" stroke-width="7" stroke-linejoin="round"/>`;
  } else {
    // jaws clamped: the two rows of teeth interlock in a wide crescent grin
    const Qt: [V, V, V] = [[60, 148], [128, 184], [196, 148]];
    const Qb: [V, V, V] = [[196, 148], [128, 216], [60, 148]];
    const band = `M${P(Qt[0])} Q${P(Qt[1])} ${P(Qt[2])} Q${P(Qb[1])} ${P(Qb[2])} Z`;
    const up = teethRow(Qt, 10, 15, 0.03, 0.97);
    const dn = teethRow(Qb, 9, 14, 0.08, 0.92);
    const mid = nextId('sm');
    mouthArt = `<clipPath id="${mid}"><path d="${band}"/></clipPath>
      <path d="${band}" fill="${C.crimsonDeep}"/>
      <g clip-path="url(#${mid})"><path d="${dn}" fill="${C.white}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/><path d="${up}" fill="${C.white}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/></g>
      <path d="${band}" fill="none" stroke="${C.ink}" stroke-width="7" stroke-linejoin="round"/>
      <path d="M50 138 Q56 146 54 156 M206 138 Q200 146 202 156" stroke="${C.ink}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
  }
  const chomp = p.chomp
    ? ([
        [[25, 134], [12, 126]],
        [[23, 150], [9, 151]],
      ] as V[][])
        .flatMap(([a, b]) => [[a, b], [[256 - a[0], a[1]], [256 - b[0], b[1]]] as V[]])
        .map((pp) => `<path d="${lens(pp, 3.4)}" fill="${C.white}" stroke="${C.ink}" stroke-width="2.4" stroke-linejoin="round"/>`)
        .join('')
    : '';
  const eyeY = shut ? 106 : 108;
  const eyes =
    p.eyes === 'open' || p.eyes === 'wide'
      ? `${eyeWhite(96, eyeY - (p.eyes === 'wide' ? 3 : 0), p.eyes === 'wide' ? 18.5 : 17.5, p.eyes === 'wide' ? 23 : 21, 6)}${eyeWhite(160, eyeY - (p.eyes === 'wide' ? 3 : 0), p.eyes === 'wide' ? 18.5 : 17.5, p.eyes === 'wide' ? 23 : 21, 6)}
         ${pieEye(100, eyeY + 6, p.eyes === 'wide' ? 7.5 : 8.5, p.eyes === 'wide' ? 11 : 12.5)}${pieEye(157, eyeY + 6, p.eyes === 'wide' ? 7.5 : 8.5, p.eyes === 'wide' ? 11 : 12.5)}`
      : p.eyes === 'blink'
        ? closedEye(96, eyeY + 3, 24, false) + closedEye(160, eyeY + 3, 24, false)
        : closedEye(96, eyeY, 26, true) + closedEye(160, eyeY, 26, true);
  const bUp = p.eyes === 'wide' ? -8 : 0;
  const brows = brow(72, 82 + bUp, 114, 96 + bUp, -3, 4.8) + brow(184, 82 + bUp, 142, 96 + bUp, 3, 4.8);
  const gill = (x: number, s: number) =>
    [0, 1, 2].map((i) => `<path d="${lens([[x + s * i * 9, 118 - i * 2], [x + s * i * 9 - s * 7, 134 - i * 2], [x + s * i * 9, 150 - i * 2]], 2.4)}" fill="${T.hatch}"/>`).join('');
  const headF = celForm(head, {
    ...T,
    cut: [-13, -15],
    twist: -3,
    hatch: T.hatch,
    seed: 9,
    t: hT || undefined,
    inner: `<clipPath id="${bellyClip}"><path d="${head}"/></clipPath><g clip-path="url(#${bellyClip})">${cel(belly, { base: C.white, shade: mix(C.sharkLight, C.white, 0.2), cut: [-8, -12], hatch: mix(C.sharkLight, C.shark, 0.4), hatchGap: 6.5, seed: 10 })}</g>`,
  });
  const finF = celForm(fin, { ...T, cut: [-7, -9], hatch: T.hatch, seed: 12 });
  const finsLR = [finL, finR].map((d, i) => celForm(d, { base: mix(C.shark, C.sharkDeep, 0.3), shade: T.shade, cut: [-6, -7], seed: 14 + i }));

  return composeSymbol({
    autoCel: false,
    texture: { seed: 6 },
    contour: 0.8,
    inkShift: [1, 1.2],
    layers: [
      { fills: finF.fills, lines: finF.line() },
      { fills: finsLR.map((f) => f.fills).join(''), lines: finsLR.map((f) => f.line()).join('') },
      { fills: headF.fills, lines: headF.line() },
    ],
    top: `
      ${shine([[108, 70], [118, 48], [138, 31]], 2.6, 0.55)}
      ${g(`${shine([[58, 110], [70, 86], [94, 69], [116, 64]], 3.2, 0.6)}
      ${gill(44, 1)}${gill(212, -1)}
      ${eyes}${brows}
      <path d="M78 74 L104 104" stroke="${C.crimsonLight}" stroke-width="5" stroke-linecap="round"/>
      <path d="M84 86 l7 -5 M90 93 l7 -5 M96 100 l7 -5" stroke="${C.ink}" stroke-width="2.6" stroke-linecap="round"/>
      <ellipse cx="116" cy="${shut ? 134 : 136}" rx="4" ry="2.6" fill="${C.ink}"/><ellipse cx="140" cy="${shut ? 134 : 136}" rx="4" ry="2.6" fill="${C.ink}"/>
      ${mouthArt}${chomp}`)}
      <circle cx="161" cy="48" r="12" fill="none" stroke="${C.ink}" stroke-width="10"/>
      <circle cx="161" cy="48" r="12" fill="none" stroke="${C.gold}" stroke-width="5"/>
      <path d="M161 60 A12 12 0 0 0 173 48" fill="none" stroke="${C.goldDeep}" stroke-width="3"/>
      <path d="M152 42 Q155 37 160 36" stroke="${C.goldLight}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M150 40 C156 44 160 52 160 60" stroke="${C.shark}" stroke-width="7" fill="none" stroke-linecap="round"/>
      ${sparkle(182, 36, 7, C.goldLight)}`,
  });
}

const SHARK: Record<Pose, SharkPose> = {
  idle: { eyes: 'open', jaw: 'grin' },
  blink: { eyes: 'blink', jaw: 'grin' },
  win: { eyes: 'happy', jaw: 'wide' },
};

export function sharkHead(pose: Pose = 'idle'): string {
  return sharkArt(SHARK[pose]);
}

/** Shark win loop: jaws gape, CHOMP shut (the head squashes), gape, chomp. */
export const sharkWinFrames: (() => string)[] = [
  () => sharkArt({ eyes: 'wide', jaw: 'wide' }),
  () => sharkArt({ eyes: 'happy', jaw: 'shut', chomp: true, squash: 0.97 }),
  () => sharkArt({ eyes: 'open', jaw: 'mid' }),
  () => sharkArt({ eyes: 'happy', jaw: 'shut', chomp: true, squash: 0.98 }),
];

/* ------------------------------------------------------------------ */
/* H1: Sparks the parrot (green, red bandana)                          */
/* ------------------------------------------------------------------ */
export type ParrotExpr = 'idle' | 'blink' | 'happy' | 'squawk' | 'worried';

/**
 * Sparks' head, in the house hand-cel style (cut shadows, hatching, cut highlights, grain).
 * `symbol` = standalone symbol art (drop shadow and the paint filter). `part` cuts one layer out
 * for the rig (track C): the base (feathers, bandana, head), one eye's white / ring / pupil / lid,
 * the happy squint, the upper beak, the open lower beak, the worried brows and the sweat drop,
 * each cropped to its own box in the head's 256 coordinates. 'all' (the default) is the whole
 * head; nested unpainted (`symbol` false) it takes the paint of the art it sits in. `painted`
 * forces the paint filter on or off (a standalone portrait without a drop shadow).
 */
export function parrotHead(
  expr: ParrotExpr = 'idle',
  symbol = true,
  part: 'all' | 'base' | 'eyeWhite' | 'eyeRing' | 'pupil' | 'lid' | 'lidHappy' | 'beak' | 'jaw' | 'browL' | 'browR' | 'tear' = 'all',
  painted?: boolean,
): string {
  const G = celTones(C.parrot, C.parrotDeep, C.parrotLight);
  const RED = celTones(C.crimson, C.crimsonDeep, C.crimsonLight);
  const YEL = celTones(C.parrotYellow, C.goldDeep, C.goldLight);
  const BLUE = celTones(C.parrotBlue, C.navy, C.moonGlow);
  const head = 'M128 58 C174 58 204 90 206 132 C208 176 174 208 128 208 C82 208 48 176 50 132 C52 90 82 58 128 58 Z';
  const feathers = [
    { f: taper([[100, 70], [80, 46], [52, 34]], 17, 5), t: G },
    { f: taper([[112, 62], [104, 32], [86, 10]], 18, 5), t: YEL },
    { f: taper([[126, 58], [132, 30], [146, 10]], 17, 5), t: BLUE },
  ];
  const bandana = 'M48 122 C42 72 84 36 130 36 C176 36 214 72 208 122 C190 106 160 98 128 98 C96 98 66 106 48 122 Z';
  const dots: [number, number, number][] = [[86, 62, 6], [124, 50, 6], [162, 58, 6], [190, 84, 5], [66, 94, 5], [104, 80, 5.5], [144, 78, 5.5], [180, 104, 4]];
  const tail1 = 'M212 100 C224 88 238 90 244 102 C234 102 226 108 218 116 Z';
  const tail2 = 'M212 118 C226 122 234 134 236 148 C226 140 216 134 204 130 Z';
  const knot = 'M194 113 A13 13 0 1 0 220 113 A13 13 0 1 0 194 113 Z';
  const beak = 'M102 158 C100 142 156 140 156 156 C158 180 146 198 120 210 C124 198 120 188 111 182 C104 176 102 168 102 158 Z';
  const open = expr === 'happy' || expr === 'squawk';
  const beakT = open ? `rotate(${expr === 'squawk' ? -13 : -8} 128 154)` : '';
  const lower = expr === 'squawk' ? 'M104 172 C100 216 156 218 156 176 C144 186 116 186 104 172 Z' : 'M106 176 C104 206 152 208 152 178 C140 186 118 186 106 176 Z';
  const eyesOpen = expr === 'idle' || expr === 'squawk' || expr === 'worried';
  const up = expr === 'worried' ? -5 : 0;
  const ey = 130;
  const er: [number, number] = expr === 'squawk' ? [8.5, 12] : [10, 14];
  const whites = `<ellipse cx="105" cy="${ey}" rx="21" ry="25" fill="${C.white}" stroke="${C.ink}" stroke-width="6.5"/><ellipse cx="151" cy="${ey}" rx="21" ry="25" fill="${C.white}" stroke="${C.ink}" stroke-width="6.5"/>`;
  const shutLid = (cx: number) => `${cel(`M${cx - 21} ${ey} A21 25 0 1 0 ${cx + 21} ${ey} A21 25 0 1 0 ${cx - 21} ${ey} Z`, { ...G, cut: [-5, -6] })}<ellipse cx="${cx}" cy="${ey}" rx="21" ry="25" fill="none" stroke="${C.ink}" stroke-width="6.5"/>`;
  const eyes = eyesOpen
    ? `${whites}${pieEye(109, ey + 5 + up, er[0], er[1])}${pieEye(149, ey + 5 + up, er[0], er[1])}`
    : expr === 'blink'
      ? `${shutLid(105)}${shutLid(151)}${closedEye(105, ey + 3, 28, false)}${closedEye(151, ey + 3, 28, false)}`
      : closedEye(104, ey + 2, 30, true) + closedEye(152, ey + 2, 30, true);
  const worry = expr === 'worried' ? brow(84, 106, 116, 100, 3, 3.6) + brow(172, 106, 140, 100, -3, 3.6) : '';
  // hand-cel forms: feathers with their quills, knot tails, the head, the polka-dot bandana
  const featherForms = feathers.map(({ f, t }, i) =>
    celForm(f.d, { ...t, cut: [-4, -5], seed: 90 + i, inner: `<path d="${midrib(f.spine)}" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".55"/>` }),
  );
  const tails = [tail1, tail2].map((d, i) => celForm(d, { ...RED, cut: [-4, -5], seed: 94 + i }));
  const headF = celForm(head, {
    ...G,
    cut: [-12, -14],
    twist: -3,
    hatch: G.hatch,
    hatchGap: 5.5,
    seed: 96,
    inner: `<path d="M66 152 q8 8 18 6 M72 166 q8 7 18 5 M190 152 q-8 8 -18 6 M184 166 q-8 7 -18 5" stroke="${G.light}" stroke-width="3.5" fill="none" stroke-linecap="round" opacity=".9"/>`,
  });
  const bandF = celForm(bandana, {
    ...RED,
    cut: [-8, -10],
    hatch: RED.hatch,
    hatchGap: 5.5,
    seed: 97,
    inner: dots.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.paper}"/>`).join(''),
  });
  const knotF = celForm(knot, { ...RED, cut: [-4, -5], seed: 98 });
  const layers = [
    { fills: featherForms.map((x) => x.fills).join(''), lines: featherForms.map((x) => x.line('stroke-width="6"')).join('') },
    { fills: tails.map((x) => x.fills).join(''), lines: tails.map((x) => x.line()).join('') },
    { fills: headF.fills, lines: headF.line() },
    { fills: bandF.fills, lines: bandF.line() },
    { fills: knotF.fills, lines: knotF.line() },
  ];
  const beakArt = (t: string) => `<g${t ? ` transform="${t}"` : ''}>
        ${cel(beak, { ...YEL, cut: [-5, -7], seed: 99 })}<path d="${beak}" fill="none" stroke="${C.ink}" stroke-width="7" stroke-linejoin="round"/>
        ${shine([[112, 164], [118, 176], [123, 186]], 2.6, 0.7)}
        <path d="M106 154 Q128 146 152 153" stroke="${C.goldDeep}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>
        <ellipse cx="119" cy="152" rx="3.2" ry="2.2" fill="${C.ink}"/><ellipse cx="139" cy="152" rx="3.2" ry="2.2" fill="${C.ink}"/>
      </g>`;
  const blush = `<ellipse cx="70" cy="178" rx="12" ry="7" fill="${C.parrotRed}" opacity=".5"/><ellipse cx="186" cy="178" rx="12" ry="7" fill="${C.parrotRed}" opacity=".5"/>`;
  const headShine = shine([[62, 104], [82, 72], [104, 60], [122, 56]], 3.2, 0.5);
  const tear = `<path d="M196 150 q-8 12 0 18 q8 -6 0 -18 Z" fill="${C.moonGlow}" stroke="${C.ink}" stroke-width="3"/>`;
  const paint = painted ?? (symbol || part !== 'all');
  if (part !== 'all') {
    const crop = (svg: string, b: [number, number, number, number]) => svg.replace(/viewBox="0 0 256 256" width="256" height="256"/, `viewBox="${b[0]} ${b[1]} ${b[2]} ${b[3]}" width="${b[2]}" height="${b[3]}"`);
    const plain = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">${body}</svg>`;
    const grain = (body: string) => composeSymbol({ autoCel: false, texture: { seed: 12 }, inkShift: [1, 1.2], noDrop: true, layers: [{ fills: '' }], top: body });
    const lid = 'M84 128 C84 108 92 104 105 104 C118 104 126 108 126 128 C126 144 118 155 105 155 C92 155 84 144 84 128 Z';
    switch (part) {
      case 'base':
        return crop(composeSymbol({ autoCel: false, texture: { seed: 12 }, contour: 0.8, inkShift: [1, 1.2], noDrop: true, layers, top: `${blush}${headShine}` }), [26, 0, 230, 216]);
      case 'eyeWhite':
        return crop(plain(`<ellipse cx="105" cy="${ey}" rx="21" ry="25" fill="${C.white}"/>`), [82, 103, 46, 54]);
      case 'eyeRing':
        return crop(plain(`<ellipse cx="105" cy="${ey}" rx="21" ry="25" fill="none" stroke="${C.ink}" stroke-width="6.5"/>`), [78, 99, 54, 62]);
      case 'pupil':
        return crop(plain(pieEye(109, ey + 5, 10, 14)), [96, 118, 26, 34]);
      case 'lid':
        return crop(grain(`${cel(lid, { ...G, cut: [-4, -5], seed: 100 })}<path d="M85 134 C88 148 96 154 105 154 C114 154 122 148 125 134" fill="none" stroke="${C.ink}" stroke-width="6.5" stroke-linecap="round"/>`), [80, 100, 50, 58]);
      case 'lidHappy':
        return crop(plain(closedEye(104, ey + 2, 30, true)), [84, 112, 42, 26]);
      case 'beak':
        return crop(grain(beakArt('')), [94, 136, 68, 80]);
      case 'jaw': {
        const jaw = 'M104 172 C100 216 156 218 156 176 C144 186 116 186 104 172 Z';
        return crop(grain(`<path d="${jaw}" fill="${C.inkSoft}" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/><ellipse cx="130" cy="200" rx="13" ry="7" fill="${C.pink}"/>`), [96, 166, 68, 54]);
      }
      case 'browL':
        return crop(plain(brow(84, 106, 116, 100, 3, 3.6)), [78, 92, 44, 22]);
      case 'browR':
        return crop(plain(brow(172, 106, 140, 100, -3, 3.6)), [134, 92, 44, 22]);
      case 'tear':
        return crop(plain(tear), [184, 144, 24, 30]);
    }
  }
  return composeSymbol({
    autoCel: false,
    inkShift: [1, 1.2],
    ...(paint ? { texture: { seed: 12 }, contour: 0.8 } : {}),
    noDrop: !symbol,
    layers,
    top: `
      ${blush}
      ${eyes}${worry}
      ${open ? `<path d="${lower}" fill="${C.inkSoft}" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/><ellipse cx="130" cy="${expr === 'squawk' ? 200 : 194}" rx="13" ry="7" fill="${C.pink}"/>` : ''}
      ${beakArt(beakT)}
      ${headShine}
      ${expr === 'worried' ? tear : ''}`,
  });
}
const midrib = (s: V[]) => {
  const a = Math.floor(s.length * 0.12);
  const b = Math.floor(s.length * 0.85);
  return `M${P(s[a])} ${s.slice(a + 1, b).map((p) => `L${P(p)}`).join(' ')}`;
};

/* ------------------------------------------------------------------ */
/* H1 symbol: Sparks' head (track C's parrotHead) with flapping wings  */
/* ------------------------------------------------------------------ */
/** Left wing, local space: shoulder at the origin, wing reaching left (-x); one bold scalloped silhouette. */
const WING = `M10 -18 C-16 -38 -72 -38 -100 -22 Q-114 -12 -102 -3${scallops(
  [
    [-102, -3],
    [-94, 14],
    [-79, 28],
    [-60, 38],
    [-40, 41],
  ],
  0.32,
  -1,
)} C-22 36 -4 26 10 8 Z`;
/** The green covert over the wing root (the rest of the wing shows blue flight feathers). */
const WING_COVERT = `M20 -40 L-52 -40 C-62 -20 -58 0 -48 8${scallops(
  [
    [-48, 8],
    [-36, 18],
    [-22, 22],
    [-8, 20],
    [6, 14],
  ],
  0.3,
  -1,
)} L20 14 Z`;
const WING_EDGE = 'M10 -18 C-16 -38 -72 -38 -100 -22 L-96 -12 C-70 -26 -18 -26 6 -6 Z';
const WING_QUILLS = 'M-94 14 Q-72 4 -54 0 M-79 28 Q-62 16 -48 10 M-60 38 Q-48 26 -38 18';

interface ParrotPose {
  expr: ParrotExpr;
  /** Wing raise in degrees (negative = down), or null with the wings tucked out of sight. */
  wing: number | null;
  /** Foreshortening along the wing (1 = broadside, smaller mid-stroke). */
  reach?: number;
  squawk?: boolean;
}

function parrotArt(p: ParrotPose): string {
  const G = tones(C.parrot, C.parrotDeep, C.parrotLight);
  const B = tones(C.parrotBlue, C.navy, C.moonGlow);
  const reach = p.reach ?? 1;
  const wingT = (side: 0 | 1) => `translate(${side ? 194 : 62} 150) rotate(${side ? -(p.wing ?? 0) : p.wing ?? 0}) scale(${(0.82 * reach).toFixed(3)} .82)`;
  const m0 = (d: string, side: 0 | 1) => (side ? mirrorX(d, 0) : d);
  const wings =
    p.wing === null
      ? []
      : ([0, 1] as const).map((side) => {
          const t = wingT(side);
          const covert = cel(m0(WING_COVERT, side), { ...G, t, cut: [-6, -8], hatch: G.hatch, hatchGap: 5, seed: 70 + side });
          return celForm(m0(WING, side), {
            ...B,
            t,
            cut: [-7, -9],
            hatch: B.hatch,
            hatchGap: 5.5,
            seed: 60 + side,
            inner: `${covert}<path d="${m0(WING_EDGE, side)}" transform="${t}" fill="${C.parrotRed}"/><path d="${m0(WING_QUILLS, side)}" transform="${t}" fill="none" stroke="${C.navy}" stroke-width="3.6" stroke-linecap="round"/>`,
          });
        });
  const head = parrotHead(p.expr, false).replace(/^<svg /, '<svg x="0" y="0" ');
  const squawk = p.squawk
    ? ([
        [[196, 44], [208, 20]],
        [[208, 58], [232, 44]],
        [[214, 76], [240, 74]],
      ] as V[][])
        .map((pp) => `<path d="${lens(pp, 3.6)}" fill="${C.white}" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/>`)
        .join('')
    : '';
  return composeSymbol({
    autoCel: false,
    texture: { seed: 7 },
    contour: 0.8,
    inkShift: [1, 1.2],
    layers: wings.length ? [{ fills: wings.map((w) => w.fills).join(''), lines: wings.map((w) => w.line('stroke-width="6.5"')).join('') }] : [{ fills: '' }],
    top: `${head}${squawk}`,
  });
}

const PARROT: Record<Pose, ParrotPose> = {
  idle: { expr: 'idle', wing: null },
  blink: { expr: 'blink', wing: null },
  win: { expr: 'happy', wing: 58 },
};

/** Symbol frames for the parrot (idle / blink / win squawk). */
export const parrotSymbol = (pose: Pose) => parrotArt(PARROT[pose]);

/** Parrot win loop: a full wingbeat (up, down-stroke, down, recovery) while Sparks squawks. */
export const parrotWinFrames: (() => string)[] = [
  () => parrotArt({ expr: 'happy', wing: 60 }),
  () => parrotArt({ expr: 'squawk', wing: 12, reach: 0.62, squawk: true }),
  () => parrotArt({ expr: 'squawk', wing: -38, reach: 0.7, squawk: true }),
  () => parrotArt({ expr: 'happy', wing: 30, reach: 0.72 }),
];
