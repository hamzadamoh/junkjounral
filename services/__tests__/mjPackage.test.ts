/**
 * Unit tests for Midjourney prompt package generation
 */

import { generateMJPackage, formatMJFlags, MJPackage } from '../chatgptService';

// Mock fetch for testing
global.fetch = jest.fn();

describe('formatMJFlags', () => {
  it('should format flags correctly with sref_url', () => {
    const mj_ref = 'hand-drawn ink & watercolor, vintage collage, warm glow, amber, burnt sienna, charcoal';
    const sref_url = 'https://cdn.example.com/uploads/fire_base.jpg';
    const seed = 42003;
    
    const result = formatMJFlags(mj_ref, sref_url, seed, 50, 0.7, 10);
    
    expect(result).toBe('--ref "hand-drawn ink & watercolor, vintage collage, warm glow, amber, burnt sienna, charcoal" --sref https://cdn.example.com/uploads/fire_base.jpg --sref-weight 0.7 --seed 42003 --stylize 50 --chaos 10');
  });
  
  it('should format flags correctly without sref_url', () => {
    const mj_ref = 'watercolor wash, delicate ink linework, paper grain, icy teal, frost blue, soft gray';
    const seed = 100001;
    
    const result = formatMJFlags(mj_ref, null, seed, 50, 0.7, 10);
    
    expect(result).toBe('--ref "watercolor wash, delicate ink linework, paper grain, icy teal, frost blue, soft gray" --seed 100001 --stylize 50 --chaos 10');
  });
  
  it('should use custom stylize, sref_weight, and chaos values', () => {
    const mj_ref = 'test style';
    const seed = 12345;
    
    const result = formatMJFlags(mj_ref, null, seed, 75, 0.9, 20);
    
    expect(result).toContain('--stylize 75');
    expect(result).toContain('--chaos 20');
  });
});

describe('generateMJPackage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  it('should generate package matching Example A (with sref_url)', async () => {
    const mockResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            subject_suggestion: 'majestic stag portrait',
            style_tokens: 'hand-drawn ink & watercolor, vintage collage, warm glow',
            palette_tokens: 'amber, burnt sienna, charcoal',
            mj_prompt: 'Majestic stag portrait, three-quarter view'
          })
        }
      }]
    };
    
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });
    
    const imageAnalysis = {
      clusters: [{
        id: 'test-001',
        theme: 'Fire collection',
        primary_subject: 'majestic stag',
        style: 'hand-drawn ink & watercolor, vintage collage',
        technique: 'watercolor',
        palette: [
          { name: 'amber', hex: '#FFBF00' },
          { name: 'burnt sienna', hex: '#E97451' },
          { name: 'charcoal', hex: '#36454F' }
        ],
        vibe: 'warm, glowing',
        dominant_textures: ['paper grain'],
        recommended_prompt_example: 'PRIMARY SUBJECT: majestic stag. Hand-drawn ink & watercolor illustration...'
      }],
      confidence: 0.9
    };
    
    const result = await generateMJPackage(
      imageAnalysis,
      42,
      3,
      'https://cdn.example.com/uploads/fire_base.jpg'
    );
    
    expect(result.subject_suggestion).toBe('majestic stag portrait');
    expect(result.style_tokens).toBe('hand-drawn ink & watercolor, vintage collage, warm glow');
    expect(result.palette_tokens).toBe('amber, burnt sienna, charcoal');
    expect(result.sref_url).toBe('https://cdn.example.com/uploads/fire_base.jpg');
    expect(result.batch_seed).toBe(42);
    expect(result.variation_index).toBe(3);
    expect(result.mj_prompt).toBe('Majestic stag portrait, three-quarter view');
    expect(result.mj_ref).toBe('hand-drawn ink & watercolor, vintage collage, warm glow, amber, burnt sienna, charcoal');
    expect(result.mj_flags).toContain('--ref');
    expect(result.mj_flags).toContain('--sref https://cdn.example.com/uploads/fire_base.jpg');
    expect(result.mj_flags).toContain('--sref-weight 0.7');
    expect(result.mj_flags).toContain('--seed 42003'); // 42 * 1000 + 3
  });
  
  it('should generate package matching Example B (without sref_url)', async () => {
    const mockResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            subject_suggestion: 'birch forest path',
            style_tokens: 'watercolor wash, delicate ink linework, paper grain',
            palette_tokens: 'icy teal, frost blue, soft gray',
            mj_prompt: 'Birch forest path, winding into distance'
          })
        }
      }]
    };
    
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });
    
    const result = await generateMJPackage(
      'Winter collection',
      100,
      1,
      null
    );
    
    expect(result.subject_suggestion).toBe('birch forest path');
    expect(result.style_tokens).toBe('watercolor wash, delicate ink linework, paper grain');
    expect(result.palette_tokens).toBe('icy teal, frost blue, soft gray');
    expect(result.sref_url).toBeNull();
    expect(result.batch_seed).toBe(100);
    expect(result.variation_index).toBe(1);
    expect(result.mj_prompt).toBe('Birch forest path, winding into distance');
    expect(result.mj_ref).toBe('watercolor wash, delicate ink linework, paper grain, icy teal, frost blue, soft gray');
    expect(result.mj_flags).toContain('--ref');
    expect(result.mj_flags).not.toContain('--sref');
    expect(result.mj_flags).toContain('--seed 100001'); // 100 * 1000 + 1
  });
  
  it('should throw error if mj_prompt contains style tokens', async () => {
    const mockResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            subject_suggestion: 'deer portrait',
            style_tokens: 'watercolor wash, delicate ink',
            palette_tokens: 'teal, blue',
            mj_prompt: 'Deer portrait in watercolor wash style' // Contains "watercolor" from style_tokens
          })
        }
      }]
    };
    
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });
    
    await expect(
      generateMJPackage('Test theme', 1, 1, null)
    ).rejects.toThrow('mj_prompt contains style token');
  });
  
  it('should compute seed correctly: batch_seed * 1000 + variation_index', async () => {
    const mockResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            subject_suggestion: 'test subject',
            style_tokens: 'test style',
            palette_tokens: 'test color',
            mj_prompt: 'Test subject description'
          })
        }
      }]
    };
    
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });
    
    const result = await generateMJPackage('Test', 42, 7, null);
    
    // Seed should be 42 * 1000 + 7 = 42007
    expect(result.mj_flags).toContain('--seed 42007');
  });
  
  it('should generate batch_seed if not provided', async () => {
    const mockResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            subject_suggestion: 'test subject',
            style_tokens: 'test style',
            palette_tokens: 'test color',
            mj_prompt: 'Test subject description'
          })
        }
      }]
    };
    
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });
    
    const result = await generateMJPackage('Test', null, 1, null);
    
    expect(result.batch_seed).toBeGreaterThan(0);
    expect(typeof result.batch_seed).toBe('number');
  });
});

