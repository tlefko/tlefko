import { captainTorso, pirateBoot, linstock, parrotBody, parrotWing, parrotTail, perchBarrel } from '../../../src/art/crew';
import { captainHead } from '../../../src/art/captain';
import { parrotHead } from '../../../src/art/critters';
import { glove, prayingHands } from '../../../src/art/characters';

export default () => [
  { label: 'torso', svg: captainTorso(), w: 240 },
  { label: 'boot', svg: pirateBoot(), w: 240 },
  { label: 'linstock', svg: linstock(), w: 240 },
  { label: 'glove fist', svg: glove('fist'), w: 240 },
  { label: 'glove open', svg: glove('open'), w: 240 },
  { label: 'praying hands', svg: prayingHands(), w: 240 },
  { label: 'cap head smug', svg: captainHead('smug'), w: 240 },
  { label: 'cap head shock', svg: captainHead('shock'), w: 240 },
  { label: 'cap head pray', svg: captainHead('pray'), w: 240 },
  { label: 'parrot body', svg: parrotBody(), w: 240 },
  { label: 'wing', svg: parrotWing(), w: 240 },
  { label: 'tail', svg: parrotTail(), w: 240 },
  { label: 'barrel', svg: perchBarrel(), w: 240 },
  { label: 'parrot rig head', svg: parrotHead('squawk', false), w: 240 },
];
