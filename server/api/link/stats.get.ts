import type { H3Event } from 'h3'
import { z } from 'zod'
import { SqlBricks } from '../../utils/sql-bricks'
import { logsMap } from '../../utils/access-log'
import { useWAE } from '../../utils/cloudflare'

const { select, and, gte, lt } = SqlBricks

export default eventHandler(async (event) => {
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  // 支持分页
  const { page = 1, pageSize = 50 } = await getValidatedQuery(event, z.object({
    page: z.coerce.number().min(1).optional(),
    pageSize: z.coerce.number().min(1).max(100).optional(),
  }).parse)

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

  // 使用GROUP BY一次性查询所有链接的今日统计数据
  const todaySql = select(
    `index1 as id,
     SUM(_sample_interval) as pv, 
     COUNT(DISTINCT ${logsMap.ip}) as uv, 
     COUNT(DISTINCT ${logsMap.ip}) as ip`
  )
    .from(dataset)
    .where(
      and(
        gte('timestamp', SqlBricks(`toDateTime(${todayStart})`)),
        lt('timestamp', SqlBricks(`toDateTime(${todayEnd})`))
      )
    )
    .groupBy('index1')

  // 使用GROUP BY一次性查询所有链接的昨日统计数据
  const yesterdaySql = select(
    `index1 as id,
     SUM(_sample_interval) as pv, 
     COUNT(DISTINCT ${logsMap.ip}) as uv, 
     COUNT(DISTINCT ${logsMap.ip}) as ip`
  )
    .from(dataset)
    .where(
      and(
        gte('timestamp', SqlBricks(`toDateTime(${yesterdayStart})`)),
        lt('timestamp', SqlBricks(`toDateTime(${yesterdayEnd})`))
      )
    )
    .groupBy('index1')

  // 并行查询今日和昨日数据
  console.log('Today SQL:', todaySql.toString())
  console.log('Yesterday SQL:', yesterdaySql.toString())
  
  const [todayData, yesterdayData] = await Promise.all([
    useWAE(event, todaySql.toString()),
    useWAE(event, yesterdaySql.toString()),
  ])

  console.log('Today Data Sample:', todayData?.data?.[0] || todayData?.[0])
  console.log('Yesterday Data Sample:', yesterdayData?.data?.[0] || yesterdayData?.[0])

  // 解析统计数据
  const todayResults = Array.isArray(todayData) ? todayData : (todayData?.data || [])
  const yesterdayResults = Array.isArray(yesterdayData) ? yesterdayData : (yesterdayData?.data || [])

  // 构建统计数据映射
  const todayStatsMap = new Map()
  const yesterdayStatsMap = new Map()

  if (Array.isArray(todayResults)) {
    todayResults.forEach((item: any) => {
      if (item && item.id) {
        todayStatsMap.set(item.id, {
          pv: Number(item.pv) || 0,
          uv: Number(item.uv) || 0,
          ip: Number(item.ip) || 0,
        })
      }
    })
  }

  if (Array.isArray(yesterdayResults)) {
    yesterdayResults.forEach((item: any) => {
      if (item && item.id) {
        yesterdayStatsMap.set(item.id, {
          pv: Number(item.pv) || 0,
          uv: Number(item.uv) || 0,
          ip: Number(item.ip) || 0,
        })
      }
    })
  }

  // 获取有统计数据的链接ID集合
  const linkIdsWithStats = new Set<string>()
  todayStatsMap.forEach((_, id) => linkIdsWithStats.add(id))
  yesterdayStatsMap.forEach((_, id) => linkIdsWithStats.add(id))

  // 获取所有链接（支持分页）
  const links = []
  let cursor = null
  const limit = 500 // 获取所有链接用于统计
  
  // 遍历所有链接
  while (true) {
    const listResult = await KV.list({ prefix: 'link:', limit, cursor })
    
    // 并行获取链接数据
    const linkPromises = listResult.keys.map(async (key: { name: string }) => {
      const { metadata, value: link } = await KV.getWithMetadata(key.name, { type: 'json' })
      if (link) {
        return {
          ...metadata,
          ...link,
        }
      }
      return link
    })
    
    const allLinks = await Promise.all(linkPromises)
    links.push(...allLinks.filter(Boolean))
    
    cursor = listResult.cursor
    if (!cursor || listResult.keys.length < limit) {
      break
    }
  }

  // 创建链接ID到链接的映射
  const linkByIdMap = new Map(links.map(link => [link.id, link]))

  // 合并链接数据和统计数据
  // 优先显示有统计数据的链接，然后显示其他链接
  const linkStats = []
  
  // 先添加有统计数据的链接
  linkIdsWithStats.forEach((linkId) => {
    const link = linkByIdMap.get(linkId)
    if (link) {
      linkStats.push({
        ...link,
        today: todayStatsMap.get(linkId) || { pv: 0, uv: 0, ip: 0 },
        yesterday: yesterdayStatsMap.get(linkId) || { pv: 0, uv: 0, ip: 0 },
      })
    }
  })

  // 再添加没有统计数据但存在于列表中的链接
  links.forEach((link) => {
    if (!linkIdsWithStats.has(link.id)) {
      linkStats.push({
        ...link,
        today: { pv: 0, uv: 0, ip: 0 },
        yesterday: { pv: 0, uv: 0, ip: 0 },
      })
    }
  })

  // 计算汇总数据 - 需要从原始数据重新查询以获取全局去重的UV和IP
  // PV可以直接相加，但UV和IP需要全局去重
  const summarySql = select(
    `SUM(_sample_interval) as pv, 
     COUNT(DISTINCT ${logsMap.ip}) as uv, 
     COUNT(DISTINCT ${logsMap.ip}) as ip`
  )
    .from(dataset)
    .where(
      and(
        gte('timestamp', SqlBricks(`toDateTime(${todayStart})`)),
        lt('timestamp', SqlBricks(`toDateTime(${todayEnd})`))
      )
    )

  const yesterdaySummarySql = select(
    `SUM(_sample_interval) as pv, 
     COUNT(DISTINCT ${logsMap.ip}) as uv, 
     COUNT(DISTINCT ${logsMap.ip}) as ip`
  )
    .from(dataset)
    .where(
      and(
        gte('timestamp', SqlBricks(`toDateTime(${yesterdayStart})`)),
        lt('timestamp', SqlBricks(`toDateTime(${yesterdayEnd})`))
      )
    )

  console.log('Summary SQL Today:', summarySql.toString())
  console.log('Summary SQL Yesterday:', yesterdaySummarySql.toString())
  
  const [todaySummary, yesterdaySummary] = await Promise.all([
    useWAE(event, summarySql.toString()),
    useWAE(event, yesterdaySummarySql.toString()),
  ])

  console.log('Today Summary Raw:', todaySummary)
  console.log('Yesterday Summary Raw:', yesterdaySummary)

  const todaySummaryResult = Array.isArray(todaySummary) ? todaySummary[0] : (todaySummary?.data?.[0] || {})
  const yesterdaySummaryResult = Array.isArray(yesterdaySummary) ? yesterdaySummary[0] : (yesterdaySummary?.data?.[0] || {})
  
  console.log('Today Summary Result:', todaySummaryResult)
  console.log('Yesterday Summary Result:', yesterdaySummaryResult)

  const summary = {
    today: {
      pv: Number(todaySummaryResult?.pv) || 0,
      uv: Number(todaySummaryResult?.uv) || 0,
      ip: Number(todaySummaryResult?.ip) || 0,
    },
    yesterday: {
      pv: Number(yesterdaySummaryResult?.pv) || 0,
      uv: Number(yesterdaySummaryResult?.uv) || 0,
      ip: Number(yesterdaySummaryResult?.ip) || 0,
    },
  }

  // 实现分页
  const totalLinks = linkStats.length
  const totalPages = Math.ceil(totalLinks / pageSize)
  const startIndex = (page - 1) * pageSize
  const endIndex = startIndex + pageSize
  const paginatedLinks = linkStats.slice(startIndex, endIndex)

  return {
    summary,
    links: paginatedLinks,
    pagination: {
      page,
      pageSize,
      total: totalLinks,
      totalPages,
    },
  }
})
