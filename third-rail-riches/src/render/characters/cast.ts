/**
 * The scene's two characters, registered by the Scene when it creates them, so the big-moment
 * overlays (big win, title cards) can cue a reaction without a reference being passed around.
 */
export const cast: { conductor?: { accent(kind: 'whoop'): void }; rat?: { accent(kind: 'hop' | 'squeak'): void } } = {};
