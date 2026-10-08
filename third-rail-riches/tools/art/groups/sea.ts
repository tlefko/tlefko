import { anchor, shell, treasureMap, compass } from '../../../src/art/sea';

export default () => [
  { label: 'anchor', svg: anchor(), w: 300 },
  { label: 'shell', svg: shell(), w: 300 },
  { label: 'map', svg: treasureMap(), w: 300 },
  { label: 'compass', svg: compass(), w: 300 },
  { label: 'anchor @90', svg: anchor(), w: 90 },
  { label: 'shell @90', svg: shell(), w: 90 },
  { label: 'map @90', svg: treasureMap(), w: 90 },
  { label: 'compass @90', svg: compass(), w: 90 },
];
