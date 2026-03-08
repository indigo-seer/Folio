/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                folio: {
                    // Light theme
                    'bg': '#FAF9F6',
                    'bg-secondary': '#F0EDE8',
                    'text': '#1B2A4A',
                    'text-secondary': '#5A6B8A',
                    'accent': '#4A6FA5',
                    'accent-hover': '#3D5D8A',
                    'border': '#E2DDD5',
                    // Dark theme
                    'dark-bg': '#1A1B2E',
                    'dark-bg-secondary': '#232438',
                    'dark-text': '#E8E4DC',
                    'dark-text-secondary': '#9A9BB0',
                    'dark-accent': '#7B9ED9',
                    'dark-accent-hover': '#9BB5E3',
                    'dark-border': '#2E3048',
                },
            },
            fontFamily: {
                serif: ['"Libre Baskerville"', 'Georgia', 'serif'],
                sans: ['"Inter"', 'system-ui', 'sans-serif'],
                mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
            },
            fontSize: {
                'body': ['var(--folio-font-size, 17px)', { lineHeight: '1.7' }],
                'code': ['15px', { lineHeight: '1.6' }],
                'ui': ['13px', { lineHeight: '1.4' }],
                'graph': ['11px', { lineHeight: '1.3' }],
                'h1': ['40px', { lineHeight: '1.2', fontWeight: '700' }],
                'h2': ['32px', { lineHeight: '1.25', fontWeight: '700' }],
                'h3': ['24px', { lineHeight: '1.3', fontWeight: '600' }],
            },
            maxWidth: {
                'prose-folio': '76ch',
            },
            transitionDuration: {
                'folio': '200ms',
            },
        },
    },
    plugins: [],
}
