/**
 * Shared rubber-hose parts: the white cartoon gloves, praying hands and the cartoon flame.
 * Heads, bodies and props live in captain.ts / crew.ts; arms and legs are drawn live as hoses
 * by the rigs in render/characters/.
 */
import { C, composeSymbol, nextId } from './kit';

export type HandPose = 'open' | 'fist' | 'horns' | 'point' | 'cup' | 'flat';
/**
 * White cartoon glove, wrist at the bottom centre (128, 220), fingers up. `cup` is a palm-up hand
 * seen from the front, drawn over the lower third of whatever it holds (the bomb): its fingertips
 * curl onto the ball, the thumb stands on the right. `flat` is a flat hand, fingers together (the
 * captain shading his eye).
 */
export function glove(pose: HandPose): string {
  const cuff = 'M92 196 Q128 178 164 196 L168 226 Q128 244 88 226 Z';
  let hand = '';
  let lines = '';
  switch (pose) {
    case 'cup':
      hand =
        'M92 196 C70 182 56 160 56 136 C56 124 64 118 72 122 Q76 108 90 112 Q98 100 112 106 Q122 96 136 104 Q148 98 158 110 L172 118 C174 102 184 88 196 92 C208 96 208 116 202 134 C196 160 184 182 164 196 Z';
      lines = `<path d="M90 112 Q92 124 90 134 M112 106 Q115 120 113 132 M136 104 Q138 118 136 130 M158 110 Q160 120 158 130" stroke-width="4" opacity=".6"/>
               <path d="M172 118 C170 136 166 150 156 160" stroke-width="4.5" opacity=".7"/>`;
      break;
    case 'flat':
      hand =
        'M92 196 C74 176 66 146 70 116 L74 70 C76 50 92 44 106 48 C120 38 138 40 146 52 C162 48 176 58 176 76 L176 126 C186 118 202 118 208 130 C212 142 200 156 190 168 C182 180 174 192 164 196 Z';
      lines = `<path d="M106 52 L106 120 M128 46 L128 122 M150 56 L150 124" stroke-width="4" opacity=".55"/>`;
      break;
    case 'open':
      hand =
        'M92 196 C70 170 60 132 72 110 C80 98 92 104 94 118 L98 142 C94 106 92 70 104 62 C116 56 122 70 122 86 L124 132 C124 92 128 54 142 52 C156 52 156 70 154 92 L152 134 C158 104 164 76 178 78 C190 82 186 100 182 118 L174 158 C188 142 204 136 212 146 C218 156 204 170 192 180 C182 190 172 198 164 196 Z';
      lines = `<path d="M110 160 L114 190 M132 156 L134 186 M152 160 L150 188" stroke-width="4" opacity=".55"/>`;
      break;
    case 'fist':
      hand =
        'M88 198 C72 176 70 140 84 120 C96 104 120 98 146 100 C172 102 192 116 192 142 C192 168 180 190 166 198 Z';
      lines = `<path d="M96 122 Q110 116 122 124 M120 110 Q134 104 148 112 M146 108 Q160 104 172 114" stroke-width="5"/>
               <path d="M84 136 Q100 132 110 146 Q112 160 98 164" stroke-width="5"/>`;
      break;
    case 'horns':
      hand =
        'M88 198 C72 176 70 146 82 128 L84 76 C84 60 100 58 102 76 L104 118 C112 112 126 110 140 112 C148 112 156 116 160 122 L166 70 C168 54 184 56 184 72 L182 140 C184 166 178 188 166 198 Z';
      lines = `<path d="M106 128 Q122 122 138 128 Q146 136 140 146" stroke-width="5"/><path d="M110 150 Q126 146 142 152" stroke-width="4" opacity=".7"/>`;
      break;
    case 'point':
      hand =
        'M88 198 C72 176 72 142 86 124 C96 112 112 108 124 110 L124 46 C124 28 146 28 146 46 L146 116 C162 116 184 126 190 146 C194 168 180 190 166 198 Z';
      lines = `<path d="M100 132 Q116 126 128 136 M126 150 Q142 144 156 152" stroke-width="5"/>`;
      break;
  }
  return composeSymbol({
    noDrop: true,
    layers: [
      { fills: `<path d="${hand}" fill="${C.paper}"/>`, lines: `<path d="${hand}"/>${lines}` },
      { fills: `<path d="${cuff}" fill="${C.paperWarm}"/>`, lines: `<path d="${cuff}"/><path d="M96 208 Q128 194 160 208" stroke-width="4" opacity=".6"/>` },
    ],
  });
}

/** Two gloves pressed together in prayer (used when the wheels spin). */
export function prayingHands(): string {
  const l = 'M127 34 C118 34 112 42 110 52 C104 50 98 56 98 66 C92 68 88 76 90 86 C84 100 84 130 88 160 C90 176 92 188 96 198 L127 200 Z';
  const r = 'M129 34 C138 34 144 42 146 52 C152 50 158 56 158 66 C164 68 168 76 166 86 C172 100 172 130 168 160 C166 176 164 188 160 198 L129 200 Z';
  const thumbL = 'M92 120 C80 112 74 124 80 136 C86 148 100 156 112 158 L114 138 Z';
  return composeSymbol({
    noDrop: true,
    layers: [
      {
        fills: `<path d="${r}" fill="${C.paperWarm}"/><path d="${l}" fill="${C.paper}"/>`,
        lines: `<path d="${r}"/><path d="${l}"/>
                <path d="M110 54 L110 96 M98 68 L99 100 M146 54 L146 96 M158 68 L157 100" stroke-width="4" opacity=".7"/>`,
      },
      { fills: `<path d="${thumbL}" fill="${C.paper}"/>`, lines: `<path d="${thumbL}"/>` },
      {
        fills: `<path d="M86 188 Q128 172 170 188 L174 224 Q128 242 82 224 Z" fill="${C.paperWarm}"/>`,
        lines: `<path d="M86 188 Q128 172 170 188 L174 224 Q128 242 82 224 Z"/><path d="M92 204 Q128 190 164 204" stroke-width="4" opacity=".6"/>`,
      },
    ],
  });
}

/**
 * Cartoon flame in a named colour, or a custom [core, tip, base] palette. 128 viewBox, base at the
 * bottom centre (64, 120). Used for the linstock, lanterns and the fuse.
 */
export function flame(color: 'fire' | 'green' | 'spirit' | [string, string, string] = 'fire'): string {
  const g = nextId('fl');
  const [c0, c1, c2] = Array.isArray(color)
    ? color
    : color === 'fire' ? [C.fireCore, C.fireHot, C.fire] : color === 'green' ? [C.greenGlow, C.green, C.greenMid] : ['#f4f2ff', '#b9c2ff', '#6f62e8'];
  const outer = 'M64 120 C30 118 20 92 32 70 C40 56 38 40 30 26 C52 34 62 50 60 66 C66 46 78 28 76 6 C98 26 104 56 96 78 C104 72 108 62 106 52 C120 70 118 104 96 116 C88 120 76 121 64 120 Z';
  const inner = 'M64 114 C44 112 40 96 48 84 C54 76 54 66 50 58 C62 64 66 74 64 84 C70 72 78 64 78 52 C90 66 92 86 84 100 C80 108 72 114 64 114 Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs><linearGradient id="${g}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c1}"/></linearGradient></defs>
  <path d="${outer}" fill="url(#${g})" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/>
  <path d="${inner}" fill="${c0}"/>
</svg>`;
}
