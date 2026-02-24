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
      boxShadow: {
        'qubria': '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)',
        'qubria-lg': '0 4px 12px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3)',
      },
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
          '0%, 100%': { boxShadow: '0 0 4px rgba(99, 102, 241, 0.15)' },
          '50%': { boxShadow: '0 0 10px rgba(99, 102, 241, 0.35)' },
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
