// Procedural names for worlds and the minds that evolve on them.

const ONSETS = ['k', 'v', 'th', 's', 'z', 'm', 'n', 'r', 'l', 'qu', 'dr', 'ph', 'y', 'x', 'br', 'h', 't', 'sh'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ae', 'io', 'ou', 'ea'];
const CODAS = ['', '', 'n', 'r', 'l', 's', 'th', 'x', 'm'];

function syllable(rng) {
  return rng.pick(ONSETS) + rng.pick(VOWELS) + rng.pick(CODAS);
}

const capitalize = (s) => s[0].toUpperCase() + s.slice(1);

export function worldName(rng) {
  const n = 2 + rng.int(2);
  let name = '';
  for (let i = 0; i < n; i++) name += syllable(rng);
  return capitalize(name);
}

export function speciesName(rng) {
  const root = syllable(rng) + (rng.chance(0.5) ? "'" : '') + syllable(rng);
  const suffix = rng.pick(['i', 'ari', 'en', 'oth', 'uun', 'ae', 'ites', 'ori']);
  return capitalize(root + suffix);
}

export function placeName(rng) {
  return capitalize(syllable(rng) + syllable(rng) + rng.pick(['', 'a', 'on', 'is', 'eth', 'ar']));
}
