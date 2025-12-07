export enum GenerationStatus {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  thumbnail: string; // URL to a placeholder or icon
  basePrompt: string;
  styleKeywords: string[];
}

export interface GenerationSettings {
  pageCount: number;
  textureIntensity: 'Light' | 'Medium' | 'Heavy';
  colorIntensity: 'Muted' | 'Normal' | 'Colorful' | 'Multicolored' | 'Custom / Override';
  pageStyle: 'Full Page' | 'Collage' | 'Lined' | 'Grid' | 'Ephemera Sheet';
  elements: string[];
  includeFrames: boolean;
  includeBorders: boolean;
  aspectRatio?: string;
  midjourneyMode?: string;
  parametersForMJ?: string;
  imageService?: 'midjourney' | 'pollinations' | 'replicate' | 'legnext' | 'ttapi' | 'direct';
  replicateModel?: string;
  customThemePrompt?: string;
  customArtStyle?: string;
  promptService?: 'openai' | 'openrouter';
  styleRefUrl?: string; // WordPress URL for Midjourney --sref parameter
  primarySubject?: string; // Optional: user-specified primary subject for all variations
  skipStyleReference?: boolean; // If true, don't pass style reference URL to Midjourney (rely on detailed prompt only)
}

export interface GeneratedImage {
  id: string;
  url: string; // Base64 data URL
  prompt: string;
  timestamp: number;
  status?: 'generating' | 'completed' | 'error';
  variationNumber?: number;
}
