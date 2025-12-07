// Mock import.meta.env for Vite environment variables
// This is a workaround for Jest which doesn't support import.meta
// We need to set this up before any modules are loaded
if (typeof globalThis.import === 'undefined') {
  Object.defineProperty(globalThis, 'import', {
    value: {
      meta: {
        env: {
          VITE_OPENAI_API_KEY: 'test-openai-key',
          VITE_OPENROUTER_API_KEY: 'test-openrouter-key',
          VITE_WORDPRESS_API_URL: 'https://test-wordpress.com',
          VITE_WORDPRESS_USERNAME: 'test-user',
          VITE_WORDPRESS_PASSWORD: 'test-pass',
        }
      }
    },
    writable: true,
    configurable: true
  });
}

// Mock window for browser APIs
if (typeof globalThis.window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    value: {
      location: {
        origin: 'http://localhost:3000'
      }
    },
    writable: true,
    configurable: true
  });
}

