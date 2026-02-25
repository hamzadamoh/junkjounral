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

export const getSupabaseConfig = () => {
  // Check process.env first
  if (typeof process !== 'undefined' && process.env) {
    return {
      url: process.env.VITE_SUPABASE_URL || '',
      anonKey: process.env.VITE_SUPABASE_ANON_KEY || '',
      bucket: process.env.VITE_SUPABASE_BUCKET || 'images',
    };
  }

  // Check globalThis mock
  if (typeof globalThis !== 'undefined' && (globalThis as any).import?.meta?.env) {
    const env = (globalThis as any).import.meta.env;
    return {
      url: env.VITE_SUPABASE_URL || '',
      anonKey: env.VITE_SUPABASE_ANON_KEY || '',
      bucket: env.VITE_SUPABASE_BUCKET || 'images',
    };
  }

  // Fallback to import.meta.env
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  try {
    const env = import.meta.env;
    return {
      url: (env?.VITE_SUPABASE_URL as string) || '',
      anonKey: (env?.VITE_SUPABASE_ANON_KEY as string) || '',
      bucket: (env?.VITE_SUPABASE_BUCKET as string) || 'images',
    };
  } catch {
    return {
      url: '',
      anonKey: '',
      bucket: 'images',
    };
  }
};

export const getGoogleDriveConfig = (accountNumber: 1 | 2 = 1) => {
  // Check process.env first
  if (typeof process !== 'undefined' && process.env) {
    if (accountNumber === 2) {
      return {
        clientId: process.env.VITE_GOOGLE_DRIVE_2_CLIENT_ID || '',
        clientSecret: process.env.VITE_GOOGLE_DRIVE_2_CLIENT_SECRET || '',
        refreshToken: process.env.VITE_GOOGLE_DRIVE_2_REFRESH_TOKEN || '',
        parentFolderId: process.env.VITE_GOOGLE_DRIVE_2_PARENT_FOLDER_ID || process.env.VITE_GOOGLE_DRIVE_PARENT_FOLDER_ID || '1OcAoiBpvjmbHuzSPrTCiJ6KDXhzs_cLU',
      };
    }
    return {
      clientId: process.env.VITE_GOOGLE_DRIVE_CLIENT_ID || '',
      clientSecret: process.env.VITE_GOOGLE_DRIVE_CLIENT_SECRET || '',
      refreshToken: process.env.VITE_GOOGLE_DRIVE_REFRESH_TOKEN || '',
      parentFolderId: process.env.VITE_GOOGLE_DRIVE_PARENT_FOLDER_ID || '1OcAoiBpvjmbHuzSPrTCiJ6KDXhzs_cLU',
    };
  }

  // Check globalThis mock
  if (typeof globalThis !== 'undefined' && (globalThis as any).import?.meta?.env) {
    const env = (globalThis as any).import.meta.env;
    if (accountNumber === 2) {
      return {
        clientId: env.VITE_GOOGLE_DRIVE_2_CLIENT_ID || '',
        clientSecret: env.VITE_GOOGLE_DRIVE_2_CLIENT_SECRET || '',
        refreshToken: env.VITE_GOOGLE_DRIVE_2_REFRESH_TOKEN || '',
        parentFolderId: env.VITE_GOOGLE_DRIVE_2_PARENT_FOLDER_ID || env.VITE_GOOGLE_DRIVE_PARENT_FOLDER_ID || '1OcAoiBpvjmbHuzSPrTCiJ6KDXhzs_cLU',
      };
    }
    return {
      clientId: env.VITE_GOOGLE_DRIVE_CLIENT_ID || '',
      clientSecret: env.VITE_GOOGLE_DRIVE_CLIENT_SECRET || '',
      refreshToken: env.VITE_GOOGLE_DRIVE_REFRESH_TOKEN || '',
      parentFolderId: env.VITE_GOOGLE_DRIVE_PARENT_FOLDER_ID || '1OcAoiBpvjmbHuzSPrTCiJ6KDXhzs_cLU',
    };
  }

  // Fallback to import.meta.env
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  try {
    const env = import.meta.env;
    if (accountNumber === 2) {
      return {
        clientId: (env?.VITE_GOOGLE_DRIVE_2_CLIENT_ID as string) || '',
        clientSecret: (env?.VITE_GOOGLE_DRIVE_2_CLIENT_SECRET as string) || '',
        refreshToken: (env?.VITE_GOOGLE_DRIVE_2_REFRESH_TOKEN as string) || '',
        parentFolderId: (env?.VITE_GOOGLE_DRIVE_2_PARENT_FOLDER_ID as string) || (env?.VITE_GOOGLE_DRIVE_PARENT_FOLDER_ID as string) || '1OcAoiBpvjmbHuzSPrTCiJ6KDXhzs_cLU',
      };
    }
    return {
      clientId: (env?.VITE_GOOGLE_DRIVE_CLIENT_ID as string) || '',
      clientSecret: (env?.VITE_GOOGLE_DRIVE_CLIENT_SECRET as string) || '',
      refreshToken: (env?.VITE_GOOGLE_DRIVE_REFRESH_TOKEN as string) || '',
      parentFolderId: (env?.VITE_GOOGLE_DRIVE_PARENT_FOLDER_ID as string) || '1OcAoiBpvjmbHuzSPrTCiJ6KDXhzs_cLU',
    };
  } catch {
    return {
      clientId: '',
      clientSecret: '',
      refreshToken: '',
      parentFolderId: '1OcAoiBpvjmbHuzSPrTCiJ6KDXhzs_cLU',
    };
  }
};

export const getEtsyApiKey = (): string => {
  // Check process.env first (for Node.js/Jest environments)
  if (typeof process !== 'undefined' && process.env && process.env.VITE_ETSY_API_KEY) {
    return process.env.VITE_ETSY_API_KEY;
  }

  // Check globalThis mock (for Jest test environment)
  if (typeof globalThis !== 'undefined' && (globalThis as any).import?.meta?.env?.VITE_ETSY_API_KEY) {
    return (globalThis as any).import.meta.env.VITE_ETSY_API_KEY;
  }

  // Fallback to import.meta.env (for Vite production/dev)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - import.meta is available in Vite but not in Jest
  try {
    return (import.meta.env?.VITE_ETSY_API_KEY as string) || '';
  } catch {
    return '';
  }
};

export const getEtsySharedSecret = (): string => {
  // Check process.env first (for Node.js/Jest environments)
  if (typeof process !== 'undefined' && process.env && process.env.VITE_ETSY_SHARED_SECRET) {
    return process.env.VITE_ETSY_SHARED_SECRET;
  }

  // Check globalThis mock (for Jest test environment)
  if (typeof globalThis !== 'undefined' && (globalThis as any).import?.meta?.env?.VITE_ETSY_SHARED_SECRET) {
    return (globalThis as any).import.meta.env.VITE_ETSY_SHARED_SECRET;
  }

  // Fallback to import.meta.env (for Vite production/dev)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - import.meta is available in Vite but not in Jest
  try {
    return (import.meta.env?.VITE_ETSY_SHARED_SECRET as string) || '';
  } catch {
    return '';
  }
};

export const getEtsyConfig = () => {
  return {
    apiKey: getEtsyApiKey(),
    sharedSecret: getEtsySharedSecret(),
  };
};

export const getDropboxAccessToken = (): string => {
  // Check process.env first
  if (typeof process !== 'undefined' && process.env) {
    return (
      process.env.DROPBOX_ACCESS_TOKEN ||
      process.env.VITE_DROPBOX_ACCESS_TOKEN ||
      process.env.NEXT_PUBLIC_DROPBOX_ACCESS_TOKEN ||
      ''
    );
  }

  // Check globalThis mock
  if (typeof globalThis !== 'undefined' && (globalThis as any).import?.meta?.env) {
    const env = (globalThis as any).import.meta.env;
    return (
      env.VITE_DROPBOX_ACCESS_TOKEN ||
      env.NEXT_PUBLIC_DROPBOX_ACCESS_TOKEN ||
      ''
    );
  }

  // Fallback to import.meta.env
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  try {
    const env = import.meta.env;
    return (
      (env?.VITE_DROPBOX_ACCESS_TOKEN as string) ||
      (env?.NEXT_PUBLIC_DROPBOX_ACCESS_TOKEN as string) ||
      ''
    );
  } catch {
    return '';
  }
};

