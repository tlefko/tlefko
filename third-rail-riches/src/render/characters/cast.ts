/**
 * The scene's two characters, registered when they are created, so the big-moment overlays
 * (wheel, big win, title cards) can cue a reaction without a reference being passed around.
 * Only the first Captain / Parrot built registers (the scene's own).
 */
import type { Captain } from './Captain';
import type { Parrot } from './Parrot';

export const cast: { captain?: Captain; parrot?: Parrot } = {};
