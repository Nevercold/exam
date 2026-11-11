---
name: mcp-tool
description: Add or change a tool, resource or prompt of the exam MCP server (server/mcp/server.ts). Use whenever AI-agent access to exams is extended.
---

# MCP tools

The MCP server lives in `server/mcp/server.ts` and is created per request by `server/routes/mcp.ts`
(stateless, bound to the teacher of the API token). Tools run with exactly that teacher's rights.

## Adding a tool

```ts
server.registerTool('tool_name', {
  title: 'Deutscher Titel',                     // shown in clients
  description: 'English description for the model: what it does, side effects, limits.',
  inputSchema: { examId: examIdArg, /* zod fields, .describe() each non-obvious one */ },
  annotations: { readOnlyHint: true },         // or destructiveHint for deletions
}, tool(async ({ examId }) => {
  // throw createError({ statusCode, message: '<German text>' }) for expected errors
  return { /* plain JSON, include editorUrl(id) when an exam was touched */ }
}))
```

## Rules

- **Writes go through `saveDraft(id, content, 'mcp')`** (after `requireExamAccess` + `examContentSchema.parse`) or
  `createExam(user.id, content, 'mcp')`. Never write tables directly; never release.
- Pass replaced question ids as `reassign` so they are marked as agent-created.
- Validate with the shared schema (`examContentSchema`).
- Access = owner or shared exam (`requireExamAccess`); archive/sharing stay owner-only.
- Fetching URLs: only via `safeFetchBuffer` (SSRF protection). Images only via `storeImage`.
- Keep `exam://schema` (`server/mcp/schema-guide.ts`) in sync with the schema; describes the block model.
- Errors become `isError` results automatically through `tool(...)`; Zod errors are prettified.

## Testing

1. `pnpm test` (schema-guide examples), `pnpm typecheck`
2. Dev server + token (Settings → API-Tokens, or `POST /api/me/tokens`), then JSON-RPC via curl:

```bash
curl -s -X POST localhost:3123/mcp -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' -H "authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_exams","arguments":{}}}'
```

3. Check: own vs. shared vs. foreign exam, invalid input (readable message), `draftUpdatedVia` is `mcp` afterwards, `released` unchanged.
