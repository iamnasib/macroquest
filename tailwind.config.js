/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['"Press Start 2P"', 'cursive'],
        body: ['"Rajdhani"', 'sans-serif'],
        ui: ['"Exo 2"', 'sans-serif'],
      },
      colors: {
        void:    '#07070f',
        abyss:   '#0a0a18',
        deep:    '#0e0e24',
        panel:   '#13132e',
        border:  '#1e1e4a',
        muted:   '#2a2a5e',
        gold:    '#f5a623',
        'gold-dim': '#b87418',
        amber:   '#fbbf24',
        emerald: '#10b981',
        'emerald-dim': '#065f46',
        crystal: '#60a5fa',
        'crystal-dim': '#1e3a5f',
        rose:    '#f43f5e',
        violet:  '#7c3aed',
        'violet-dim': '#3b0764',
        text:    '#e2e8f0',
        'text-muted': '#94a3b8',
        iron:    '#94a3b8',
        wood:    '#a3774a',
        resource:'#f5a623',
      },
      boxShadow: {
        glow:        '0 0 20px rgba(245,166,35,0.3)',
        'glow-sm':   '0 0 10px rgba(245,166,35,0.2)',
        'glow-emerald': '0 0 20px rgba(16,185,129,0.3)',
        'glow-crystal': '0 0 20px rgba(96,165,250,0.3)',
        'glow-rose':    '0 0 20px rgba(244,63,94,0.3)',
        panel:       'inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      backgroundImage: {
        'grid-pattern': `linear-gradient(rgba(30,30,74,0.4) 1px, transparent 1px),
                         linear-gradient(90deg, rgba(30,30,74,0.4) 1px, transparent 1px)`,
        'scanlines': `repeating-linear-gradient(
          0deg,
          transparent,
          transparent 2px,
          rgba(0,0,0,0.05) 2px,
          rgba(0,0,0,0.05) 4px
        )`,
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 10px rgba(245,166,35,0.2)' },
          '50%':       { boxShadow: '0 0 30px rgba(245,166,35,0.6)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':       { transform: 'translateY(-6px)' },
        },
        'xp-pop': {
          '0%':   { transform: 'scale(0.5) translateY(0)', opacity: 1 },
          '100%': { transform: 'scale(1.2) translateY(-40px)', opacity: 0 },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'slide-in': {
          '0%':   { transform: 'translateX(-20px)', opacity: 0 },
          '100%': { transform: 'translateX(0)', opacity: 1 },
        },
        'blink': {
          '0%, 100%': { opacity: 1 },
          '50%':       { opacity: 0 },
        },
      },
      animation: {
        'pulse-glow':  'pulse-glow 2s ease-in-out infinite',
        'float':       'float 3s ease-in-out infinite',
        'xp-pop':      'xp-pop 1s ease-out forwards',
        'shimmer':     'shimmer 2s linear infinite',
        'slide-in':    'slide-in 0.3s ease-out',
        'blink':       'blink 1s step-end infinite',
      },
    },
  },
  plugins: [],
}
