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
  pageStyle: 'Full Page' | 'Collage' | 'Lined' | 'Grid' | 'Ephemera Sheet';
  elements: string[];
  includeFrames: boolean;
  includeBorders: boolean;
  aspectRatio?: string;
  midjourneyMode?: string;
  parametersForMJ?: string;
  imageService?: 'midjourney' | 'pollinations' | 'replicate';
  replicateModel?: string;
  customThemePrompt?: string;
}

export interface GeneratedImage {
  id: string;
  url: string; // Base64 data URL
  prompt: string;
  timestamp: number;
  status?: 'generating' | 'completed' | 'error';
  variationNumber?: number;
}
