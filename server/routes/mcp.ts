import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createExamMcpServer } from '../mcp/server'

// MCP endpoint (Streamable HTTP, stateless, JSON responses).
// Auth: personal API token in the Authorization header (Bearer scheme), see Settings -> API tokens.
export default defineEventHandler(async (event) => {
  rateLimit(event, 'mcp-ip', 300, 60 * 1000)
  await ensureDb()

  const { user, tokenId } = await requireApiTokenUser(event)
  if (!hitRateLimit(`mcp-token:${tokenId}`, 120, 60 * 1000)) {
    throw createError({ statusCode: 429, message: 'Zu viele Anfragen. Bitte kurz warten.' })
  }

  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  const server = createExamMcpServer(user, origin)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 2 * 1024 * 1024,
  })

  try {
    await server.connect(transport)
    const response = await transport.handleRequest(toWebRequest(event))
    return sendWebResponse(event, response)
  }
  finally {
    await transport.close()
    await server.close()
  }
})
