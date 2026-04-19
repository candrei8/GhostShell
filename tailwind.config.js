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
          // `text` + `accent` use rgb(<triplet> / <alpha-value>) so opacity
          // modifiers (text-ghost-text/60, bg-ghost-accent/10) work correctly.
          // Triplets are kept in sync with the hex tokens by applyTheme().
          text: 'rgb(var(--ghost-text-rgb) / <alpha-value>)',
          'text-dim': 'var(--ghost-text-dim)',
          accent: 'rgb(var(--ghost-accent-rgb) / <alpha-value>)',
          'accent-2': 'var(--ghost-accent-2)',
          'accent-3': 'var(--ghost-accent-3)',
          success: 'var(--ghost-success)',
          warning: 'var(--ghost-warning)',
          error: 'var(--ghost-error)',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Cascadia Mono', 'IBM Plex Mono', 'Consolas', 'monospace'],
        sans: ['Manrope', 'Segoe UI Variable Text', 'SF Pro Display', 'Helvetica Neue', 'sans-serif'],
      },
      fontSize: {
        '2xs': '0.6875rem',
      },
      spacing: {},
      boxShadow: {
        /* Very subtle shadows for the new minimalist look */
        'minimal': '0 1px 2px rgba(0, 0, 0, 0.5)',
        'minimal-lg': '0 4px 12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)',
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(2px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
