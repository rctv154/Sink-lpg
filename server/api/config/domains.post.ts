import { z } from 'zod'
import { DomainConfigSchema } from '@@/schemas/domain-config'

export default eventHandler(async (event) => {
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  const domainConfig = await readValidatedBody(event, z.object({
    domain: z.string().trim().min(1).max(255),
  }).parse)

  // 提取主域名（去除协议和路径）
  let domain = domainConfig.domain.toLowerCase()
  domain = domain.replace(/^https?:\/\//, '') // 移除协议
  domain = domain.replace(/\/.*$/, '') // 移除路径
  domain = domain.replace(/:\d+$/, '') // 移除端口

  // 提取主域名（最后两部分）
  const domainParts = domain.split('.')
  if (domainParts.length < 2) {
    throw createError({
      status: 400,
      statusText: 'Invalid domain format',
    })
  }
  const mainDomain = domainParts.slice(-2).join('.')

  // 检查域名是否已存在
  const configKey = 'config:subdomain_domains'
  const domainsStr = await KV.get(configKey)
  const existingDomains = domainsStr ? JSON.parse(domainsStr) : []

  if (existingDomains.some((d: { domain: string }) => d.domain === mainDomain)) {
    throw createError({
      status: 409,
      statusText: 'Domain already exists',
    })
  }

  // 创建新的域名配置
  const newDomainConfig = DomainConfigSchema.parse({
    id: `domain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    domain: mainDomain,
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
  })

  // 添加到列表并保存
  existingDomains.push(newDomainConfig)
  await KV.put(configKey, JSON.stringify(existingDomains))

  setResponseStatus(event, 201)
  return { domain: newDomainConfig }
})

