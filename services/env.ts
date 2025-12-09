/**
 * Environment variable accessor
 * Provides a consistent interface for accessing environment variables
 * that works in both Vite (import.meta.env) and Node.js/Jest (process.env) environments
 */

export const getOpenAIApiKey = (): string => {
  // Check process.env first (for Node.js/Jest environments)
  if (typeof process !== 'undefined' && process.env && process.env.VITE_OPENAI_API_KEY) {
    return process.env.VITE_OPENAI_API_KEY;
  }
  
  // Check globalThis mock (for Jest test environment)
  if (typeof globalThis !== 'undefined' && (globalThis as any).import?.meta?.env?.VITE_OPENAI_API_KEY) {
    return (globalThis as any).import.meta.env.VITE_OPENAI_API_KEY;
  }
  
  // Fallback to import.meta.env (for Vite production/dev)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - import.meta is available in Vite but not in Jest
  try {
    return (import.meta.env?.VITE_OPENAI_API_KEY as string) || '';
  } catch {
    return '';
  }
};

export const getOpenRouterApiKey = (): string => {
  // Check process.env first (for Node.js/Jest environments)
  if (typeof process !== 'undefined' && process.env && process.env.VITE_OPENROUTER_API_KEY) {
    return process.env.VITE_OPENROUTER_API_KEY;
  }
  
  // Check globalThis mock (for Jest test environment)
  if (typeof globalThis !== 'undefined' && (globalThis as any).import?.meta?.env?.VITE_OPENROUTER_API_KEY) {
    return (globalThis as any).import.meta.env.VITE_OPENROUTER_API_KEY;
  }
  
  // Fallback to import.meta.env (for Vite production/dev)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - import.meta is available in Vite but not in Jest
  try {
    return (import.meta.env?.VITE_OPENROUTER_API_KEY as string) || '';
  } catch {
    return '';
  }
};

export const getHuggingFaceApiKey = (): string => {
  // Check process.env first (for Node.js/Jest environments)
  if (typeof process !== 'undefined' && process.env && process.env.VITE_HUGGINGFACE_API_KEY) {
    return process.env.VITE_HUGGINGFACE_API_KEY;
  }
  
  // Check globalThis mock (for Jest test environment)
  if (typeof globalThis !== 'undefined' && (globalThis as any).import?.meta?.env?.VITE_HUGGINGFACE_API_KEY) {
    return (globalThis as any).import.meta.env.VITE_HUGGINGFACE_API_KEY;
  }
  
  // Fallback to import.meta.env (for Vite production/dev)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - import.meta is available in Vite but not in Jest
  try {
    return (import.meta.env?.VITE_HUGGINGFACE_API_KEY as string) || '';
  } catch {
    return '';
  }
};

export const getGeminiApiKey = (): string => {
  // Check process.env first (for Node.js/Jest environments)
  if (typeof process !== 'undefined' && process.env && process.env.VITE_GEMINI_API_KEY) {
    return process.env.VITE_GEMINI_API_KEY;
  }
  
  // Check globalThis mock (for Jest test environment)
  if (typeof globalThis !== 'undefined' && (globalThis as any).import?.meta?.env?.VITE_GEMINI_API_KEY) {
    return (globalThis as any).import.meta.env.VITE_GEMINI_API_KEY;
  }
  
  // Fallback to import.meta.env (for Vite production/dev)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - import.meta is available in Vite but not in Jest
  try {
    return (import.meta.env?.VITE_GEMINI_API_KEY as string) || '';
  } catch {
    return '';
  }
};

export const getWordPressConfig = () => {
  // Check process.env first
  if (typeof process !== 'undefined' && process.env) {
    return {
      apiUrl: process.env.VITE_WORDPRESS_API_URL || '',
      username: process.env.VITE_WP_USERNAME || process.env.VITE_WORDPRESS_USERNAME || '',
      password: process.env.VITE_WP_APP_PASSWORD || process.env.VITE_WORDPRESS_PASSWORD || '',
    };
  }
  
  // Check globalThis mock
  if (typeof globalThis !== 'undefined' && (globalThis as any).import?.meta?.env) {
    const env = (globalThis as any).import.meta.env;
    return {
      apiUrl: env.VITE_WORDPRESS_API_URL || '',
      username: env.VITE_WP_USERNAME || env.VITE_WORDPRESS_USERNAME || '',
      password: env.VITE_WP_APP_PASSWORD || env.VITE_WORDPRESS_PASSWORD || '',
    };
  }
  
  // Fallback to import.meta.env
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  try {
    const env = import.meta.env;
    return {
      apiUrl: (env?.VITE_WORDPRESS_API_URL as string) || '',
      username: (env?.VITE_WP_USERNAME as string) || (env?.VITE_WORDPRESS_USERNAME as string) || '',
      password: (env?.VITE_WP_APP_PASSWORD as string) || (env?.VITE_WORDPRESS_PASSWORD as string) || '',
    };
  } catch {
    return {
      apiUrl: '',
      username: '',
      password: '',
    };
  }
};

