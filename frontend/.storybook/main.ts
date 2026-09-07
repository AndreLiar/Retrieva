import type { StorybookConfig } from '@storybook/nextjs-vite';

import { dirname } from 'path';
import { fileURLToPath } from 'url';

// Resolve absolute package paths (needed in a monorepo/workspace).
function getAbsolutePath(value: string) {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: [getAbsolutePath('@storybook/addon-a11y'), getAbsolutePath('@storybook/addon-docs')],
  framework: getAbsolutePath('@storybook/nextjs-vite'),
  staticDirs: ['../public'],
};
export default config;
