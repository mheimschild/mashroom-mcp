import { defineConfig } from "@rsbuild/core";

export default defineConfig({
	output: {
		target: "node",
	},
	source: {
		entry: {
			"metrics-tools": "./src/metrics-tools/index.ts",
		},
	},
});
