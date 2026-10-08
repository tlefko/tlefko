import { captainHead, type CaptainExpr } from '../../../src/art/captain';
import { powderKeg, treasureChest, treasureChestOpen } from '../../../src/art/keg';

const exprs: CaptainExpr[] = ['idle', 'laugh'];
export default () => [
  { label: 'keg cold', svg: powderKeg(false), w: 300 },
  { label: 'keg lit', svg: powderKeg(true), w: 300 },
  { label: 'chest', svg: treasureChest(), w: 300 },
  { label: 'chest open', svg: treasureChestOpen(), w: 300 },
  { label: 'captain symbol', svg: captainHead('idle', true), w: 300 },
  ...exprs.map((e) => ({ label: `captain ${e}`, svg: captainHead(e), w: 300 })),
  { label: 'keg cold @90', svg: powderKeg(false), w: 90 },
  { label: 'keg lit @90', svg: powderKeg(true), w: 90 },
  { label: 'chest @90', svg: treasureChest(), w: 90 },
  { label: 'cap @90', svg: captainHead('idle', true), w: 90 },
];
