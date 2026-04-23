/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0B1730',
        'ink-soft': '#2C3E5E',
        'ink-muted': '#6B7A94',
        canvas: '#E9EEF6',
        card: '#DDE5F0',
        line: '#C5D0E1',
        'line-soft': '#D4DCEA',
        accent: '#1E47E6',
        'accent-soft': '#A8BDF5',
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      maxWidth: {
        wrap: '1320px',
      },
      typography: ({ theme }) => ({
        portfolio: {
          css: {
            '--tw-prose-body': theme('colors.ink-soft'),
            '--tw-prose-headings': theme('colors.ink'),
            '--tw-prose-links': theme('colors.accent'),
            '--tw-prose-bold': theme('colors.ink'),
            '--tw-prose-quotes': theme('colors.ink-soft'),
            '--tw-prose-quote-borders': theme('colors.line'),
            '--tw-prose-captions': theme('colors.ink-muted'),
            '--tw-prose-code': theme('colors.ink'),
            '--tw-prose-pre-bg': theme('colors.card'),
            '--tw-prose-th-borders': theme('colors.line'),
            '--tw-prose-td-borders': theme('colors.line-soft'),
            maxWidth: 'none',
            fontFamily: theme('fontFamily.sans').join(', '),
            h1: { fontFamily: theme('fontFamily.serif').join(', '), fontWeight: '460', letterSpacing: '-0.035em' },
            h2: { fontFamily: theme('fontFamily.serif').join(', '), fontWeight: '460', letterSpacing: '-0.03em' },
            h3: { fontFamily: theme('fontFamily.serif').join(', '), fontWeight: '440' },
            code: { fontFamily: theme('fontFamily.mono').join(', '), fontSize: '0.875em' },
            'code::before': { content: '""' },
            'code::after': { content: '""' },
            pre: {
              border: `1px solid ${theme('colors.line')}`,
              borderRadius: '12px',
            },
            a: {
              textDecorationColor: theme('colors.accent-soft'),
              fontWeight: 'inherit',
              '&:hover': { color: theme('colors.accent') },
            },
          },
        },
      }),
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
