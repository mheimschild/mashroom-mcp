import { defineConfig } from '@rsbuild/core';

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  output: {
    target: 'node',
  },
  source: {
    entry: {
      'listing-tools': './src/listing-tools/index.ts',
      'site-tools': './src/site-tools/index.ts',
      'page-tools': './src/page-tools/index.ts',
      'app-instance-tools': './src/app-instance-tools/index.ts',
      'plugin-tools': './src/plugin-tools/index.ts',
    },
  },
});
