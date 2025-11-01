import type { H3Event } from 'h3'
import { SqlBricks } from '../../utils/sql-bricks'
import { logsMap } from '../../utils/access-log'
import { useWAE } from '../../utils/cloudflare'

const { select, and, eq, gte, lt } = SqlBricks

export default eventHandler(async (event) => {
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

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

  // 获取所有链接
  const linkKeys = []
  const links = []
  let cursor = null
  const limit = 500

  // 遍历所有链接（使用 KV list）
  while (true) {
    const listResult = await KV.list({ prefix: 'link:', limit, cursor })
    
    for (const key of listResult.keys) {
      const linkData = await KV.get(key.name, { type: 'json' })
      if (linkData) {
        linkKeys.push(key.name)
        links.push(linkData)
      }
    }

    cursor = listResult.cursor
    if (!cursor || listResult.keys.length < limit) {
      break
    }
  }

  // 查询每个链接的统计数据
  const linkStats = await Promise.all(
    links.map(async (link) => {
      // 获取今日数据
      const todaySql = select(
        `SUM(_sample_interval) as pv, 
         COUNT(DISTINCT ${logsMap.ip}) as uv, 
         COUNT(DISTINCT ${logsMap.ip}) as ip`
      )
        .from(dataset)
        .where(
          and(
            eq('index1', link.id),
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
            eq('index1', link.id),
            gte('timestamp', SqlBricks(`toDateTime(${yesterdayStart})`)),
            lt('timestamp', SqlBricks(`toDateTime(${yesterdayEnd})`))
          )
        )

      const [todayData, yesterdayData] = await Promise.all([
        useWAE(event, todaySql.toString()),
        useWAE(event, yesterdaySql.toString()),
      ])

      return {
        ...link,
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
      pv: linkStats.reduce((sum, stat) => sum + (stat.today?.pv || 0), 0),
      uv: linkStats.reduce((sum, stat) => sum + (stat.today?.uv || 0), 0),
      ip: linkStats.reduce((sum, stat) => sum + (stat.today?.ip || 0), 0),
    },
    yesterday: {
      pv: linkStats.reduce((sum, stat) => sum + (stat.yesterday?.pv || 0), 0),
      uv: linkStats.reduce((sum, stat) => sum + (stat.yesterday?.uv || 0), 0),
      ip: linkStats.reduce((sum, stat) => sum + (stat.yesterday?.ip || 0), 0),
    },
  }

  return {
    summary,
    links: linkStats,
  }
})

