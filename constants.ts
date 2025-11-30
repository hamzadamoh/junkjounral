import { Theme } from './types';

export const APP_NAME = "Gothic Journal Artificer";

export const THEMES: Theme[] = [
  {
    id: 'victorian',
    name: 'Gothic Victorian',
    description: 'Elegant dark Victorian aesthetics with ornate frames, vintage lace, and melancholic elegance.',
    thumbnail: 'https://picsum.photos/id/106/400/600',
    basePrompt: 'A gothic victorian junk journal page, antique paper, ornate borders, victorian ladies, lace textures, sepia and black tones',
    styleKeywords: ['vintage', 'ornate', 'elegant', 'victorian']
  },
  {
    id: 'academia',
    name: 'Dark Academia',
    description: 'Scholarly gothic atmosphere with old books, ink spills, latin text, and coffee stains.',
    thumbnail: 'https://picsum.photos/id/24/400/600',
    basePrompt: 'Dark academia junk journal page, old library books, quill pens, ink stains, latin calligraphy, leather texture, moody lighting',
    styleKeywords: ['scholarly', 'moody', 'intellectual', 'textured']
  },
  {
    id: 'witchy',
    name: 'Witchy / Occult',
    description: 'Mystical elements including moon phases, crystals, tarot cards, and botanical herbs.',
    thumbnail: 'https://picsum.photos/id/238/400/600',
    basePrompt: 'Witchy occult junk journal page, moon phases, tarot card aesthetics, dried herbs, crystals, celestial map background, mystical',
    styleKeywords: ['mystical', 'celestial', 'magical', 'esoteric']
  },
  {
    id: 'botanical',
    name: 'Botanical Gothic',
    description: 'Dark nature with dried flowers, moths, ravens, and poisonous plants on aged paper.',
    thumbnail: 'https://picsum.photos/id/306/400/600',
    basePrompt: 'Gothic botanical junk journal page, dried dead roses, death head moth, raven feathers, poisonous plants, aged parchment',
    styleKeywords: ['organic', 'decay', 'nature', 'floral']
  },
  {
    id: 'steampunk',
    name: 'Steampunk Vintage',
    description: 'Industrial vintage with gears, clockwork, brass accents, and victorian invention plans.',
    thumbnail: 'https://picsum.photos/id/175/400/600',
    basePrompt: 'Steampunk junk journal page, brass gears, clockwork mechanisms, blueprint schematics, industrial victorian, copper accents',
    styleKeywords: ['industrial', 'mechanical', 'brass', 'intricate']
  },
  {
    id: 'medieval',
    name: 'Medieval Manuscript',
    description: 'Illuminated manuscript style with gold leaf effects, calligraphy, and mythical beasts.',
    thumbnail: 'https://picsum.photos/id/266/400/600',
    basePrompt: 'Medieval illuminated manuscript page, gold leaf texture, gothic calligraphy, mythical beasts, aged vellum texture',
    styleKeywords: ['ancient', 'religious', 'gold', 'script']
  }
];

export const OPTIONAL_ELEMENTS = [
  'Ravens', 'Keys', 'Moths', 'Moons', 'Skulls', 'Candles', 'Books', 'Crystals', 'Pocket Watches'
];

export const TEXTURE_PROMPTS = {
  'Light': 'lightly distressed paper, subtle aging',
  'Medium': 'moderately distressed, tea stained, worn edges',
  'Heavy': 'heavily distressed, grunge texture, burnt edges, heavy stains, torn paper'
};
