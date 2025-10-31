import { z } from 'zod'

export default eventHandler(async (event) => {
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  const { id } = await readValidatedBody(event, z.object({
    id: z.string().trim().min(1),
  }).parse)

  const configKey = 'config:subdomain_domains'
  const domainsStr = await KV.get(configKey)
  
  if (!domainsStr) {
    throw createError({
      status: 404,
      statusText: 'No domains found',
    })
  }

  const domains = JSON.parse(domainsStr)
  const filteredDomains = domains.filter((d: { id: string }) => d.id !== id)

  if (filteredDomains.length === domains.length) {
    throw createError({
      status: 404,
      statusText: 'Domain not found',
    })
  }

  await KV.put(configKey, JSON.stringify(filteredDomains))

  return { success: true }
})

