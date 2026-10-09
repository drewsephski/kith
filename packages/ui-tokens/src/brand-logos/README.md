# Brand artwork

Assets and catalog metadata come from [SVGL](https://svgl.app), under its included MIT license. Brand trademarks remain with their owners. The artwork is used unchanged to identify the corresponding services.

Run `node scripts/generate-svgl-logos.mjs` from the repository root to refresh the snapshot, then format the generated TypeScript with `pnpm exec biome check --write packages/ui-tokens/src/brand-logos`. The generator only accepts SVGL library SVGs and rejects active content. Common app, model-provider, and MCP marks are bundled for offline rendering; other recognized brands use the snapshotted SVGL asset URLs. Product startup never depends on the catalog API.

The shared resolver matches exact normalized names and explicit aliases. Unknown brands retain provider artwork or an initial. Native and web rendering select the supplied light or dark variant using the app's appearance.
