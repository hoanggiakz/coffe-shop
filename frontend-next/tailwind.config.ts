import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf8f0',
          100: '#f9eddb',
          200: '#f2d6b0',
          300: '#e8b97d',
          400: '#dd974a',
          500: '#d47d2e',
          600: '#c46524',
          700: '#a34d20',
          800: '#843e21',
          900: '#6c341e',
        },
      },
    },
  },
  plugins: [],
}

export default config
