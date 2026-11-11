@AGENTS.md

## Claude-specific

- Project skills in `.claude/skills/`:
  - `db-migration`: change the schema + generate a migration
  - `api-endpoint`: add a server endpoint following project conventions
  - `ui-page`: add a page/component (layouts, responsiveness, performance)
  - `verify`: run all checks and smoke-test the running app
  - `mcp-tool`: add/change MCP tools, resources or prompts
- Always run `pnpm lint && pnpm typecheck && pnpm test` after changes.
