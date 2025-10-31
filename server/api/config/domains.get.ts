export default eventHandler(async (event) => {
  const { cloudflare } = event.context
  const { KV } = cloudflare.env

  // 从KV获取域名配置列表
  const configKey = 'config:subdomain_domains'
  const domainsStr = await KV.get(configKey)
  
  if (!domainsStr) {
    return { domains: [] }
  }

  const domains = JSON.parse(domainsStr)
  return { domains }
})

