defineRouteMeta({
  openAPI: {
    description: 'Verify the site token',
    responses: {
      200: {
        description: 'The site token is valid',
      },
      default: {
        description: 'The site token is invalid',
      },
    },
  },
})

export default eventHandler((event) => {
  // 获取请求中的 token
  const token = getHeader(event, 'Authorization')?.replace(/^Bearer\s+/, '')
  const siteToken = useRuntimeConfig(event).siteToken

  // 验证 token
  if (!token || token !== siteToken) {
    throw createError({
      status: 401,
      statusText: 'Unauthorized',
    })
  }

  // Token 验证成功
  return {
    name: 'Sink',
    url: 'https://sink.cool',
  }
})
