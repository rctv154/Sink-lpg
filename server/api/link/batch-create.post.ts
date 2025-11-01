import { z } from 'zod'
import { LinkSchema, nanoid } from '@@/schemas/link'

const BatchCreateSchema = z.object({
  urls: z.array(z.string().trim().url().max(2048)).min(1).max(100), // 最多100个链接
  autoSlug: z.boolean().default(true), // 是否自动生成 slug
})

export default eventHandler(async (event) => {
  const { urls, autoSlug } = await readValidatedBody(event, BatchCreateSchema.parse)

  const { caseSensitive } = useRuntimeConfig(event)
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  const results = []

  for (const url of urls) {
    try {
      // 生成 slug
      let slug = autoSlug ? nanoid()() : nanoid()()
      
      if (!caseSensitive) {
        slug = slug.toLowerCase()
      }

      // 检查 slug 是否已存在
      let existingLink = await KV.get(`link:${slug}`)
      let retryCount = 0
      
      // 如果存在，重新生成（最多重试 5 次）
      while (existingLink && retryCount < 5) {
        slug = nanoid()()
        if (!caseSensitive) {
          slug = slug.toLowerCase()
        }
        existingLink = await KV.get(`link:${slug}`)
        retryCount++
      }

      if (existingLink) {
        results.push({
          url,
          success: false,
          error: 'Failed to generate unique slug after 5 retries',
        })
        continue
      }

      // 创建链接对象
      const link = LinkSchema.parse({
        url,
        slug,
      })

      // 保存到 KV
      await KV.put(`link:${link.slug}`, JSON.stringify(link), {
        metadata: {
          url: link.url,
          comment: link.comment,
        },
      })

      const shortLink = `${getRequestProtocol(event)}://${getRequestHost(event)}/${link.slug}`

      results.push({
        url,
        slug,
        shortLink,
        success: true,
        link,
      })
    }
    catch (error) {
      results.push({
        url,
        success: false,
        error: error.message || 'Unknown error',
      })
    }
  }

  const successCount = results.filter(r => r.success).length
  const failCount = results.length - successCount

  return {
    results,
    summary: {
      total: results.length,
      success: successCount,
      failed: failCount,
    },
  }
})

