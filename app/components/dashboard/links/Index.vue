<script setup>
import { Loader, ExternalLink, Download, RefreshCw } from 'lucide-vue-next'
import { parseURL } from 'ufo'
import { toast } from 'vue-sonner'

const links = ref([])
const summary = ref({
  today: { pv: 0, uv: 0, ip: 0 },
  yesterday: { pv: 0, uv: 0, ip: 0 },
})
const isLoading = ref(false)
const isLoadingStats = ref(false)

const { host, origin } = location

function formatNumber(num) {
  if (!num || typeof Intl === 'undefined')
    return num
  return new Intl.NumberFormat('zh-CN').format(num)
}

function calculateChange(current, previous) {
  if (!previous || previous === 0) {
    return current > 0 ? { value: 100, positive: true } : { value: 0, positive: false }
  }
  const change = ((current - previous) / previous * 100).toFixed(1)
  return {
    value: Math.abs(parseFloat(change)),
    positive: parseFloat(change) >= 0,
  }
}

async function loadLinksWithStats() {
  isLoading.value = true
  isLoadingStats.value = true
  try {
    const data = await useAPI('/api/link/stats')
    summary.value = data.summary || summary.value
    links.value = (data.links || []).map((link) => {
      return {
        ...link,
        today: link.today || { pv: 0, uv: 0, ip: 0 },
        yesterday: link.yesterday || { pv: 0, uv: 0, ip: 0 },
      }
    })
  }
  catch (error) {
    console.error(error)
    toast.error('加载数据失败')
  }
  finally {
    isLoading.value = false
    isLoadingStats.value = false
  }
}

function getShortLink(slug) {
  return `${origin}/${slug}`
}

function getLinkIcon(url) {
  const { host } = parseURL(url)
  return `https://unavatar.io/${host}?fallback=https://sink.cool/icon.png`
}

function updateLinkList(link, type) {
  if (type === 'edit') {
    const index = links.value.findIndex(l => l.id === link.id)
    if (index !== -1) {
      links.value[index] = { ...links.value[index], ...link }
    }
  }
  else if (type === 'delete') {
    const index = links.value.findIndex(l => l.id === link.id)
    if (index !== -1) {
      links.value.splice(index, 1)
      // 重新加载统计数据
      loadLinksWithStats()
    }
  }
  else {
    // 添加新链接后重新加载
    loadLinksWithStats()
  }
}

onMounted(() => {
  loadLinksWithStats()
})
</script>

<template>
  <main class="space-y-6">
    <div class="flex flex-col gap-6 sm:gap-2 sm:flex-row sm:justify-between">
      <DashboardNav class="flex-1">
        <div class="flex items-center gap-2">
          <DashboardLinksEditor @update:link="updateLinkList" />
          <Button
            variant="outline"
            size="sm"
            @click="loadLinksWithStats"
            :disabled="isLoadingStats"
          >
            <RefreshCw
              v-if="isLoadingStats"
              class="mr-2 h-4 w-4 animate-spin"
            />
            <RefreshCw
              v-else
              class="mr-2 h-4 w-4"
            />
            刷新
          </Button>
        </div>
      </DashboardNav>
      <LazyDashboardLinksSearch />
    </div>

    <!-- 汇总部分 -->
    <Card>
      <CardHeader>
        <CardTitle>汇总</CardTitle>
      </CardHeader>
      <CardContent class="p-0">
        <div class="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-[150px]">时间</TableHead>
                <TableHead class="text-right">累计浏览次数(PV)</TableHead>
                <TableHead class="text-right">累计独立访客(UV)</TableHead>
                <TableHead class="text-right">累计IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell class="font-medium">今日</TableCell>
                <TableCell class="text-right">
                  {{ formatNumber(summary.today.pv) }}
                </TableCell>
                <TableCell class="text-right">
                  {{ formatNumber(summary.today.uv) }}
                </TableCell>
                <TableCell class="text-right">
                  {{ formatNumber(summary.today.ip) }}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell class="font-medium">昨日</TableCell>
                <TableCell class="text-right">
                  {{ formatNumber(summary.yesterday.pv) }}
                </TableCell>
                <TableCell class="text-right">
                  {{ formatNumber(summary.yesterday.uv) }}
                </TableCell>
                <TableCell class="text-right">
                  {{ formatNumber(summary.yesterday.ip) }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <!-- 链接详细统计 -->
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <CardTitle>链接数据</CardTitle>
          <Button variant="outline" size="sm">
            <Download class="mr-2 h-4 w-4" />
            下载报表
          </Button>
        </div>
      </CardHeader>
      <CardContent class="p-0">
        <div v-if="isLoading" class="flex items-center justify-center p-12">
          <Loader class="animate-spin h-6 w-6" />
        </div>
        <div v-else-if="links.length === 0" class="flex items-center justify-center p-12 text-muted-foreground">
          <p>暂无链接数据</p>
        </div>
        <div v-else class="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-[60px]">序号</TableHead>
                <TableHead class="min-w-[150px]">短链</TableHead>
                <TableHead class="min-w-[200px]">原始链接</TableHead>
                <TableHead class="text-right">浏览次数(PV)</TableHead>
                <TableHead class="text-right">独立访客(UV)</TableHead>
                <TableHead class="text-right">IP</TableHead>
                <TableHead class="w-[100px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-for="(link, index) in links" :key="link.id">
                <!-- 今日行 -->
                <TableRow class="hover:bg-muted/50">
                  <TableCell>{{ index + 1 }}</TableCell>
                  <TableCell>
                    <div class="flex items-center gap-2">
                      <Avatar class="h-6 w-6 shrink-0">
                        <AvatarImage
                          :src="getLinkIcon(link.url)"
                          :alt="link.slug"
                        />
                        <AvatarFallback>
                          <img
                            src="/icon.png"
                            alt="Sink"
                            class="h-4 w-4"
                          >
                        </AvatarFallback>
                      </Avatar>
                      <span class="font-medium">{{ host }}/{{ link.slug }}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <a
                      :href="link.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-blue-600 hover:underline flex items-center gap-1 truncate max-w-md"
                    >
                      {{ link.url }}
                      <ExternalLink class="h-3 w-3 shrink-0" />
                    </a>
                  </TableCell>
                  <TableCell class="text-right font-medium">
                    {{ formatNumber(link.today.pv) }}
                    <span
                      v-if="link.yesterday.pv > 0"
                      class="text-xs ml-1"
                      :class="calculateChange(link.today.pv, link.yesterday.pv).positive ? 'text-green-600' : 'text-red-600'"
                    >
                      ({{ calculateChange(link.today.pv, link.yesterday.pv).positive ? '+' : '-' }}{{ calculateChange(link.today.pv, link.yesterday.pv).value }}%)
                    </span>
                  </TableCell>
                  <TableCell class="text-right font-medium">
                    {{ formatNumber(link.today.uv) }}
                    <span
                      v-if="link.yesterday.uv > 0"
                      class="text-xs ml-1"
                      :class="calculateChange(link.today.uv, link.yesterday.uv).positive ? 'text-green-600' : 'text-red-600'"
                    >
                      ({{ calculateChange(link.today.uv, link.yesterday.uv).positive ? '+' : '-' }}{{ calculateChange(link.today.uv, link.yesterday.uv).value }}%)
                    </span>
                  </TableCell>
                  <TableCell class="text-right font-medium">
                    {{ formatNumber(link.today.ip) }}
                    <span
                      v-if="link.yesterday.ip > 0"
                      class="text-xs ml-1"
                      :class="calculateChange(link.today.ip, link.yesterday.ip).positive ? 'text-green-600' : 'text-red-600'"
                    >
                      ({{ calculateChange(link.today.ip, link.yesterday.ip).positive ? '+' : '-' }}{{ calculateChange(link.today.ip, link.yesterday.ip).value }}%)
                    </span>
                  </TableCell>
                  <TableCell>
                    <NuxtLink
                      :to="`/dashboard/link?slug=${link.slug}`"
                      class="text-blue-600 hover:underline text-sm"
                    >
                      查看报表
                    </NuxtLink>
                  </TableCell>
                </TableRow>
                <!-- 昨日行 -->
                <TableRow class="bg-muted/30">
                  <TableCell />
                  <TableCell>
                    <span class="text-sm text-muted-foreground">昨日</span>
                  </TableCell>
                  <TableCell />
                  <TableCell class="text-right text-sm text-muted-foreground">
                    {{ formatNumber(link.yesterday.pv) }}
                  </TableCell>
                  <TableCell class="text-right text-sm text-muted-foreground">
                    {{ formatNumber(link.yesterday.uv) }}
                  </TableCell>
                  <TableCell class="text-right text-sm text-muted-foreground">
                    {{ formatNumber(link.yesterday.ip) }}
                  </TableCell>
                  <TableCell>
                    <DashboardLinksDelete
                      :link="link"
                      @update:link="updateLinkList"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        class="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        删除
                      </Button>
                    </DashboardLinksDelete>
                  </TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  </main>
</template>
