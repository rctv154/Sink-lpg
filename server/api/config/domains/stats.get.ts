import type { H3Event } from 'h3'
import { SqlBricks } from '../../../utils/sql-bricks'
import { logsMap } from '../../../utils/access-log'
import { useWAE } from '../../../utils/cloudflare'

const { select, and, like, gte, lt } = SqlBricks

export default eventHandler(async (event) => {
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  // 获取所有配置的域名
  const configKey = 'config:subdomain_domains'
  const domainsStr = await KV.get(configKey)
  const domains = domainsStr ? JSON.parse(domainsStr) : []

  // 计算今日和昨日的时间范围
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const todayStart = Math.floor(today.getTime() / 1000)
  const todayEnd = Math.floor(tomorrow.getTime() / 1000) - 1
  const yesterdayStart = Math.floor(yesterday.getTime() / 1000)
  const yesterdayEnd = Math.floor(today.getTime() / 1000) - 1

  const { dataset } = useRuntimeConfig(event)

  // 查询每个域名的统计数据
  const domainStats = await Promise.all(
    domains.map(async (domainConfig: { domain: string; id: string }) => {
      const domain = domainConfig.domain
      
      // 获取今日数据（通过URL匹配域名）
      // PV: 页面访问量（使用采样间隔）
      // UV: 独立访客数（按IP去重）
      // IP: 独立IP数（按IP去重，UV和IP在这里相同，但为了一致性分开统计）
      const todaySql = select(
        `SUM(_sample_interval) as pv, 
         COUNT(DISTINCT ${logsMap.ip}) as uv, 
         COUNT(DISTINCT ${logsMap.ip}) as ip`
      )
        .from(dataset)
        .where(
          and(
            like(logsMap.url, `%${domain}%`),
            gte('timestamp', SqlBricks(`toDateTime(${todayStart})`)),
            lt('timestamp', SqlBricks(`toDateTime(${todayEnd})`))
          )
        )

      // 获取昨日数据
      const yesterdaySql = select(
        `SUM(_sample_interval) as pv, 
         COUNT(DISTINCT ${logsMap.ip}) as uv, 
         COUNT(DISTINCT ${logsMap.ip}) as ip`
      )
        .from(dataset)
        .where(
          and(
            like(logsMap.url, `%${domain}%`),
            gte('timestamp', SqlBricks(`toDateTime(${yesterdayStart})`)),
            lt('timestamp', SqlBricks(`toDateTime(${yesterdayEnd})`))
          )
        )

      const [todayData, yesterdayData] = await Promise.all([
        useWAE(event, todaySql.toString()),
        useWAE(event, yesterdaySql.toString()),
      ])

      return {
        domain: domainConfig.domain,
        id: domainConfig.id,
        today: {
          pv: todayData?.[0]?.pv || 0,
          uv: todayData?.[0]?.uv || 0,
          ip: todayData?.[0]?.ip || 0,
        },
        yesterday: {
          pv: yesterdayData?.[0]?.pv || 0,
          uv: yesterdayData?.[0]?.uv || 0,
          ip: yesterdayData?.[0]?.ip || 0,
        },
      }
    })
  )

  // 计算汇总数据
  const summary = {
    today: {
      pv: domainStats.reduce((sum, stat) => sum + stat.today.pv, 0),
      uv: domainStats.reduce((sum, stat) => sum + stat.today.uv, 0),
      ip: domainStats.reduce((sum, stat) => sum + stat.today.ip, 0),
    },
    yesterday: {
      pv: domainStats.reduce((sum, stat) => sum + stat.yesterday.pv, 0),
      uv: domainStats.reduce((sum, stat) => sum + stat.yesterday.uv, 0),
      ip: domainStats.reduce((sum, stat) => sum + stat.yesterday.ip, 0),
    },
  }

  return {
    summary,
    domains: domainStats,
  }
})

