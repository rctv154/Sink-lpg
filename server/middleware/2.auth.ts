export default eventHandler((event) => {
  const token = getHeader(event, 'Authorization')?.replace(/^Bearer\s+/, '')
  
  // 排除 /api/verify 和 /api/_ 开头的路径，这些路径不需要认证
  if (event.path.startsWith('/api/') 
    && !event.path.startsWith('/api/_') 
    && event.path !== '/api/verify' 
    && token !== useRuntimeConfig(event).siteToken) {
    throw createError({
      status: 401,
      statusText: 'Unauthorized',
    })
  }
  if (token && token.length < 8) {
    throw createError({
      status: 401,
      statusText: 'Token is too short',
    })
  }
})
