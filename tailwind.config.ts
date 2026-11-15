import path from 'path';
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    path.join(__dirname, 'app/**/*.{js,ts,jsx,tsx,mdx}'),
    path.join(__dirname, 'components/**/*.{js,ts,jsx,tsx,mdx}'),
    path.join(__dirname, 'lib/**/*.{js,ts,jsx,tsx,mdx}'),
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          'system-ui',
          'sans-serif',
        ],
      },
      colors: {
        ios: {
          bg: 'var(--ios-bg)',
          card: 'var(--ios-card)',
          elevated: 'var(--ios-elevated)',
          border: 'var(--ios-border)',
          accent: 'var(--ios-accent)',
          label: 'var(--ios-label)',
          secondary: 'var(--ios-secondary)',
          tertiary: 'var(--ios-tertiary)',
        },
      },
    },
  },
  plugins: [],
};

export default config;
