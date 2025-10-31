import { z } from 'zod'

export const DomainConfigSchema = z.object({
  id: z.string().trim(),
  domain: z.string().trim().min(1).max(255), // 主域名，如 baidu.com
  createdAt: z.number().int().safe().default(() => Math.floor(Date.now() / 1000)),
  updatedAt: z.number().int().safe().default(() => Math.floor(Date.now() / 1000)),
})

export type DomainConfig = z.infer<typeof DomainConfigSchema>

