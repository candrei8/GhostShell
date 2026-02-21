/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ghost: {
          bg: 'var(--ghost-bg)',
          surface: 'var(--ghost-surface)',
          sidebar: 'var(--ghost-sidebar)',
          border: 'var(--ghost-border)',
          text: 'var(--ghost-text)',
          'text-dim': 'var(--ghost-text-dim)',
          accent: 'var(--ghost-accent)',
          'accent-2': 'var(--ghost-accent-2)',
          'accent-3': 'var(--ghost-accent-3)',
          success: 'var(--ghost-success)',
          warning: 'var(--ghost-warning)',
          error: 'var(--ghost-error)',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': '0.6875rem',
      },
      spacing: {},
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'breathe': 'ghost-breathe 2.4s ease-in-out infinite',
        'slide-in': 'ghost-slide-in 180ms ease-out',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'ghost-breathe': {
          '0%, 100%': { boxShadow: '0 0 6px rgba(168, 85, 247, 0.2)' },
          '50%': { boxShadow: '0 0 14px rgba(168, 85, 247, 0.45)' },
        },
        'ghost-slide-in': {
          from: { opacity: '0', transform: 'translateX(-6px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
