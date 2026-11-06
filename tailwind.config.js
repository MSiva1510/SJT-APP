/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['Sora', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
      },
      colors: {
        navy: {
          50:  '#e8ecf5',
          100: '#c5cfe6',
          200: '#9eadd4',
          300: '#768bc1',
          400: '#5b74b4',
          500: '#415da7',
          600: '#39559f',
          700: '#2e4994',
          800: '#243e8a',
          900: '#0d1b4b',
          950: '#080f2a',
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'slide-in': 'slideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        'fade-up':  'fadeUp 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        slideIn: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
