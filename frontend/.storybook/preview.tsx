import type { Preview } from '@storybook/nextjs-vite';
import React from 'react';
import '../src/app/globals.css';

// Render every story on the real brand theme: dark premium surface + brand fonts.
const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'ink',
      values: [
        { name: 'ink', value: '#0A0E14' },
        { name: 'light', value: '#F8F5F0' },
      ],
    },
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    a11y: { test: 'todo' },
  },
  decorators: [
    (Story) => (
      <div className="dark" style={{ padding: 32, background: '#0A0E14', minHeight: '100vh' }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
