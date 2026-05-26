import { defineConfig } from '@rsbuild/core';

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  output: {
    target: 'node',
  },
  source: {
    entry: {
      index: './src/mashroom-bootstrap-api.ts',
      'mcp-tool-registry': './src/mcp-tool-registry.ts',
    },
  },
});
