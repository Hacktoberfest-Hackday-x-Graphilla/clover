/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        pine: {
          950: '#10231B',
          900: '#143325',
          800: '#1B7A4D',
          700: '#16663F',
          600: '#1B7A4D',
        },
        brand: {
          DEFAULT: '#1B7A4D',
          dark: '#16663F',
          mint: '#4FD08F',
        },
        page: '#F5F7F6',
        card: '#FFFFFF',
        line: '#D5E0D8',
        ink: '#1C2420',
        inkdark: '#E8F1EA',
        muted: '#5E6B64',
        taken: '#B7791F',
        warn: '#B42318',
      },
      fontFamily: {
        display: ['Rubik', 'system-ui', 'sans-serif'],
        body: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
}
