// Friendly random names for "Surprise me" sounds.

export const ADJECTIVES = [
  'Fuzzy', 'Sparkly', 'Sleepy', 'Bouncy', 'Wobbly', 'Cosmic', 'Grumpy', 'Velvet',
  'Tiny', 'Glitchy', 'Dreamy', 'Funky', 'Shiny', 'Snuggly', 'Zesty', 'Moody',
  'Jolly', 'Electric', 'Gentle', 'Cheeky', 'Fizzy', 'Lazy', 'Brave', 'Wiggly',
];

export const NOUNS = [
  'Pancake', 'Comet', 'Walrus', 'Bubble', 'Robot', 'Cloud', 'Noodle', 'Moon',
  'Whale', 'Pickle', 'Rocket', 'Kitten', 'Marshmallow', 'Volcano', 'Penguin', 'Taco',
  'Jellyfish', 'Cactus', 'Mango', 'Dragon', 'Teapot', 'Satellite', 'Gecko', 'Lantern',
];

export const SOUND_EMOJI = ['🫧', '🌙', '🍬', '🛸', '🐙', '🌈', '🍉', '🦄', '⚡', '🌵', '🎈', '🪐', '🐳', '🍄', '🔮', '🦖'];

const pick = (list, rng) => list[Math.floor(rng() * list.length) % list.length];

export function randomName(rng = Math.random) {
  return `${pick(ADJECTIVES, rng)} ${pick(NOUNS, rng)}`;
}

export function randomEmoji(rng = Math.random) {
  return pick(SOUND_EMOJI, rng);
}
