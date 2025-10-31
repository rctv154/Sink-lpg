import type { LinkSchema } from '@@/schemas/link'
import type { z } from 'zod'
import { parsePath, parseURL, withQuery } from 'ufo'
import CryptoJS from 'crypto-js'

/**
 * 获取允许修改的域名列表
 */
async function getAllowedDomains(KV: any): Promise<string[]> {
  try {
    const configKey = 'config:subdomain_domains'
    const domainsStr = await KV.get(configKey)
    
    if (!domainsStr) {
      return []
    }

    const domains = JSON.parse(domainsStr)
    return domains.map((d: { domain: string }) => d.domain)
  }
  catch (error) {
    console.error('Failed to get allowed domains:', error)
    return []
  }
}

/**
 * 替换URL中的二级域名为当前日期的MD5加密后8位
 * 只对允许列表中的域名进行替换
 * 例如：https://kk123.baidu.com -> https://a1b2c3d4.baidu.com（假设MD5后8位是a1b2c3d4）
 */
async function replaceSubdomainWithDate(url: string, allowedDomains: string[]): Promise<string> {
  try {
    const parsed = parseURL(url)
    if (!parsed.host)
      return url

    // 分割主机名，例如：kk123.baidu.com -> ['kk123', 'baidu', 'com']
    const hostParts = parsed.host.split('.')
    
    // 如果少于3部分，说明没有二级域名，直接返回原URL
    if (hostParts.length < 3)
      return url

    // 获取主域名（最后两部分，例如：baidu.com）
    const mainDomain = hostParts.slice(-2).join('.')
    
    // 检查域名是否在允许列表中
    const isAllowed = allowedDomains.some((d: string) => d === mainDomain)
    if (!isAllowed) {
      // 不在允许列表中，直接返回原URL
      return url
    }
    
    // 生成当前日期（格式：YYYYMMDD）
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1)
    const day = String(now.getDate())
    // 格式化月份和日期为两位数字
    const monthStr = month.length === 1 ? `0${month}` : month
    const dayStr = day.length === 1 ? `0${day}` : day
    const dateStr = `${year}${monthStr}${dayStr}`
    
    // 对当前日期进行MD5加密
    const md5Hash = CryptoJS.MD5(dateStr).toString(CryptoJS.enc.Hex)
    // 取MD5的后8位作为二级域名
    const subdomain = md5Hash.slice(-8)
    
    // 构建新的主机名：MD5后8位.主域名
    const newHost = `${subdomain}.${mainDomain}`
    
    // 重新构建URL（确保protocol格式正确，通常为 https: 或 http:）
    const protocol = parsed.protocol || (url.indexOf('https') === 0 ? 'https:' : 'http:')
    const pathname = parsed.pathname || ''
    const search = parsed.search || ''
    const hash = parsed.hash || ''
    
    const newUrl = `${protocol}//${newHost}${pathname}${search}${hash}`
    
    return newUrl
  }
  catch (error) {
    console.error('Failed to replace subdomain with date:', error)
    return url
  }
}

export default eventHandler(async (event) => {
  const { pathname: slug } = parsePath(event.path.replace(/^\/|\/$/g, '')) // remove leading and trailing slashes
  const { slugRegex, reserveSlug } = useAppConfig(event)
  const { homeURL, linkCacheTtl, redirectWithQuery, caseSensitive } = useRuntimeConfig(event)
  const { cloudflare } = event.context

  if (event.path === '/' && homeURL)
    return sendRedirect(event, homeURL)

  if (slug && !reserveSlug.includes(slug) && slugRegex.test(slug) && cloudflare) {
    const { KV } = cloudflare.env

    let link: z.infer<typeof LinkSchema> | null = null

    const getLink = async (key: string) =>
      await KV.get(`link:${key}`, { type: 'json', cacheTtl: linkCacheTtl })

    const lowerCaseSlug = slug.toLowerCase()
    link = await getLink(caseSensitive ? slug : lowerCaseSlug)

    // fallback to original slug if caseSensitive is false and the slug is not found
    if (!caseSensitive && !link && lowerCaseSlug !== slug) {
      console.log('original slug fallback:', `slug:${slug} lowerCaseSlug:${lowerCaseSlug}`)
      link = await getLink(slug)
    }

    if (link) {
      event.context.link = link
      try {
        await useAccessLog(event)
      }
      catch (error) {
        console.error('Failed write access log:', error)
      }
      
      // 获取允许修改的域名列表
      const allowedDomains = await getAllowedDomains(KV)
      
      // 替换二级域名为当前日期（只对允许列表中的域名进行替换）
      const targetUrl = await replaceSubdomainWithDate(link.url, allowedDomains)
      
      // 如果需要携带查询参数
      const target = redirectWithQuery ? withQuery(targetUrl, getQuery(event)) : targetUrl
      return sendRedirect(event, target, +useRuntimeConfig(event).redirectStatusCode)
    }
  }
})
