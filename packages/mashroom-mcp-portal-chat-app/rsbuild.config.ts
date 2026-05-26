import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  output: {
    filenameHash: false,
    minify: false,
  },
  performance: {
    chunkSplit: {
      strategy: 'all-in-one'
    }
  },
  plugins: [pluginReact()],
});