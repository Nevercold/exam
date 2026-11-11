// RFC 9728 Protected Resource Metadata (root variant, clients fall back to it)
export default defineEventHandler(event => protectedResourceMetadata(event))
