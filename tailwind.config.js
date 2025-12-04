/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./*.{js,ts,jsx,tsx}",
    "./App.tsx",
    "./index.tsx"
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Cinzel', 'serif'],
        sans: ['Lato', 'sans-serif'],
      },
      colors: {
        gothic: {
          900: '#0f0e13',
          800: '#1a1821',
          700: '#2d2a35',
          accent: '#8b5cf6',
          gold: '#d4af37',
        }
      }
    },
  },
  plugins: [],
}

