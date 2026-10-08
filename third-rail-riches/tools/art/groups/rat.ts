import { ratHead, ratSymbol, ratWinFrames, ratTorso, ratFoot, ratTailStrip, ratLuggage, ratCrumb, ratSqueakLines, RAT_PARTS, type RatExpr, type RatPart } from '../../../src/art/rat';
import { glove } from '../../../src/art/characters';

const ex: RatExpr[] = ['idle', 'blink', 'happy', 'squeak', 'worried'];
const parts = Object.keys(RAT_PARTS) as RatPart[];
const light = 'linear-gradient(#efe2c0,#c9b48a)';
export default () => [
  { label: 'rat symbol idle', svg: ratSymbol('idle'), w: 256 },
  { label: 'rat symbol blink', svg: ratSymbol('blink'), w: 256 },
  { label: 'rat symbol win', svg: ratSymbol('win'), w: 256 },
  ...ratWinFrames.map((f, i) => ({ label: `win frame ${i + 1}`, svg: f(), w: 180 })),
  { label: '@90 idle', svg: ratSymbol('idle'), w: 90 },
  { label: '@90 win', svg: ratSymbol('win'), w: 90 },
  { label: '@90 on tile', svg: ratSymbol('idle'), w: 90, bg: light },
  ...ex.map((e) => ({ label: `head ${e}`, svg: ratHead(e, false), w: 220 })),
  { label: 'head no cap', svg: ratHead('happy', false, 'all', null), w: 220 },
  { label: 'torso', svg: ratTorso(), w: 220 },
  { label: 'foot L', svg: ratFoot('L'), w: 110 },
  { label: 'foot R', svg: ratFoot('R'), w: 110 },
  { label: 'tail strip', svg: ratTailStrip(), w: 400 },
  { label: 'luggage', svg: ratLuggage(), w: 300 },
  { label: 'luggage on tile', svg: ratLuggage(), w: 300, bg: light },
  { label: 'crumb', svg: ratCrumb(), w: 80 },
  { label: 'squeak', svg: ratSqueakLines(), w: 80 },
  { label: 'glove open', svg: glove('open'), w: 100 },
  ...parts.map((p) => ({ label: `part ${p}`, svg: ratHead(p === 'tear' || p.startsWith('brow') ? 'worried' : 'idle', false, p), w: 120, bg: '#5a5a5a' })),
];
