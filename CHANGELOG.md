# Changelog

All notable changes to the `termalin-mcp` bridge. Versions follow semver; each entry is the npm release of the same number.

## 0.1.2 — 2026-11-26

- `package.json` carries `mcpName` (`in.termal/termalin-web`), so the official MCP registry can list the npm package next to the hosted endpoint.

## 0.1.1 — 2026-11-26

- README installs from npm (`npx -y termalin-mcp`) instead of the GitHub URL.
- Releases are published from GitHub Actions through npm trusted publishing, with provenance.

## 0.1.0 — 2026-11-26

- First release: a dependency-free stdio bridge to `https://termal.in/api/v1/mcp`. Reads JSON-RPC from stdin, posts each message with the API key from `TERMALIN_API_KEY` (or `TERMALIN_API_KEY_FILE`), passes event-stream replies through, and turns HTTP errors into JSON-RPC errors.
