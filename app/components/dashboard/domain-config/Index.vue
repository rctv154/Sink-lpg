<script setup>
import { Globe, Loader, Plus, Trash2, ExternalLink, Download } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const domains = ref([])
const domainStats = ref([])
const summary = ref({
  today: { pv: 0, uv: 0, ip: 0 },
  yesterday: { pv: 0, uv: 0, ip: 0 },
})
const isLoading = ref(false)
const isLoadingStats = ref(false)
const isAdding = ref(false)
const newDomain = ref('')
const showAddDialog = ref(false)

const { t } = useI18n()

async function loadDomains() {
  isLoading.value = true
  try {
    const data = await useAPI('/api/config/domains')
    domains.value = data.domains || []
  }
  catch (error) {
    console.error(error)
    toast.error('加载域名列表失败')
  }
  finally {
    isLoading.value = false
  }
}

async function loadStats() {
  if (domains.value.length === 0) {
    domainStats.value = []
    return
  }

  isLoadingStats.value = true
  try {
    const data = await useAPI('/api/config/domains/stats')
    summary.value = data.summary || summary.value
    domainStats.value = data.domains || []
  }
  catch (error) {
    console.error(error)
    toast.error('加载统计数据失败')
  }
  finally {
    isLoadingStats.value = false
  }
}

async function addDomain() {
  if (!newDomain.value.trim()) {
    toast.error('请输入域名')
    return
  }

  isAdding.value = true
  try {
    await useAPI('/api/config/domains', {
      method: 'POST',
      body: {
        domain: newDomain.value.trim(),
      },
    })
    toast.success('添加成功')
    newDomain.value = ''
    showAddDialog.value = false
    await loadDomains()
    await loadStats()
  }
  catch (error) {
    console.error(error)
    if (error?.data?.statusMessage) {
      toast.error(error.data.statusMessage)
    }
    else {
      toast.error('添加失败')
    }
  }
  finally {
    isAdding.value = false
  }
}

async function deleteDomain(domainId, domainName) {
  try {
    await new Promise((resolve, reject) => {
      if (confirm(`确定要删除域名 "${domainName}" 吗？\n删除后该域名将不再进行二级域名替换。`)) {
        resolve()
      }
      else {
        reject(new Error('用户取消'))
      }
    })

    await useAPI('/api/config/domains/delete', {
      method: 'POST',
      body: {
        id: domainId,
      },
    })
    toast.success('删除成功')
    await loadDomains()
    await loadStats()
  }
  catch (error) {
    if (error.message === '用户取消') {
      return
    }
    console.error(error)
    if (error?.data?.statusMessage) {
      toast.error(error.data.statusMessage)
    }
    else {
      toast.error('删除失败')
    }
  }
}

function getDomainIcon(domain) {
  return `https://unavatar.io/${domain}?fallback=https://sink.cool/icon.png`
}

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

watch(domains, () => {
  loadStats()
}, { deep: true })

onMounted(async () => {
  await loadDomains()
  await loadStats()
})
</script>

<template>
  <main class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <div class="flex items-center gap-2 mb-2">
          <Globe class="h-6 w-6 text-primary" />
          <h2 class="text-2xl font-bold">域名统计</h2>
        </div>
        <p class="text-sm text-muted-foreground">
          查看各域名的访问统计数据（今日/昨日对比）
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          @click="loadStats"
          :disabled="isLoadingStats"
        >
          <Loader
            v-if="isLoadingStats"
            class="mr-2 h-4 w-4 animate-spin"
          />
          刷新
        </Button>
        <Button @click="showAddDialog = true" class="shadow-sm">
          <Plus class="mr-2 h-4 w-4" />
          添加域名
        </Button>
      </div>
    </div>

    <!-- 添加域名对话框 -->
    <Dialog v-model:open="showAddDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加域名</DialogTitle>
          <DialogDescription>
            输入需要修改二级域名的域名（如：baidu.com），系统会自动提取主域名
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <div class="space-y-2">
            <Label for="domain">域名</Label>
            <Input
              id="domain"
              v-model="newDomain"
              placeholder="例如：baidu.com 或 https://www.baidu.com"
              @keyup.enter="addDomain"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            @click="showAddDialog = false"
          >
            取消
          </Button>
          <Button
            :disabled="isAdding"
            @click="addDomain"
          >
            {{ isAdding ? '添加中...' : '添加' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 加载状态 -->
    <Card v-if="isLoading">
      <CardContent class="p-6">
        <div class="flex items-center justify-center">
          <Loader class="animate-spin h-6 w-6" />
        </div>
      </CardContent>
    </Card>

    <!-- 空状态 -->
    <Card v-else-if="domains.length === 0" class="border-dashed">
      <CardContent class="p-12">
        <div class="flex flex-col items-center justify-center text-center">
          <div class="rounded-full bg-muted p-4 mb-4">
            <Globe class="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 class="text-lg font-semibold mb-2">暂无域名配置</h3>
          <p class="text-sm text-muted-foreground mb-4 max-w-sm">
            点击"添加域名"按钮添加需要修改二级域名的域名
          </p>
          <Button variant="outline" @click="showAddDialog = true">
            <Plus class="mr-2 h-4 w-4" />
            添加第一个域名
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- 统计表格 -->
    <div v-else class="space-y-4">
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

      <!-- 域名详细统计 -->
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between">
            <CardTitle>站点数据</CardTitle>
            <Button variant="outline" size="sm">
              <Download class="mr-2 h-4 w-4" />
              下载报表
            </Button>
          </div>
        </CardHeader>
        <CardContent class="p-0">
          <div class="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-[60px]">序号</TableHead>
                  <TableHead class="min-w-[150px]">站点名称</TableHead>
                  <TableHead class="min-w-[200px]">站点首页</TableHead>
                  <TableHead class="text-right">浏览次数(PV)</TableHead>
                  <TableHead class="text-right">独立访客(UV)</TableHead>
                  <TableHead class="text-right">IP</TableHead>
                  <TableHead class="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <template v-for="(stat, index) in domainStats" :key="stat.id">
                  <!-- 今日行 -->
                  <TableRow class="hover:bg-muted/50">
                    <TableCell>{{ index + 1 }}</TableCell>
                    <TableCell>
                      <div class="flex items-center gap-2">
                        <Avatar class="h-6 w-6 shrink-0">
                          <AvatarImage
                            :src="getDomainIcon(stat.domain)"
                            :alt="stat.domain"
                          />
                          <AvatarFallback>
                            <Globe class="h-3 w-3" />
                          </AvatarFallback>
                        </Avatar>
                        <span class="font-medium">{{ stat.domain }}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <a
                        :href="`https://${stat.domain}`"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {{ stat.domain }}
                        <ExternalLink class="h-3 w-3" />
                      </a>
                    </TableCell>
                    <TableCell class="text-right font-medium">
                      {{ formatNumber(stat.today.pv) }}
                      <span
                        v-if="stat.yesterday.pv > 0"
                        class="text-xs ml-1"
                        :class="calculateChange(stat.today.pv, stat.yesterday.pv).positive ? 'text-green-600' : 'text-red-600'"
                      >
                        ({{ calculateChange(stat.today.pv, stat.yesterday.pv).positive ? '+' : '-' }}{{ calculateChange(stat.today.pv, stat.yesterday.pv).value }}%)
                      </span>
                    </TableCell>
                    <TableCell class="text-right font-medium">
                      {{ formatNumber(stat.today.uv) }}
                      <span
                        v-if="stat.yesterday.uv > 0"
                        class="text-xs ml-1"
                        :class="calculateChange(stat.today.uv, stat.yesterday.uv).positive ? 'text-green-600' : 'text-red-600'"
                      >
                        ({{ calculateChange(stat.today.uv, stat.yesterday.uv).positive ? '+' : '-' }}{{ calculateChange(stat.today.uv, stat.yesterday.uv).value }}%)
                      </span>
                    </TableCell>
                    <TableCell class="text-right font-medium">
                      {{ formatNumber(stat.today.ip) }}
                      <span
                        v-if="stat.yesterday.ip > 0"
                        class="text-xs ml-1"
                        :class="calculateChange(stat.today.ip, stat.yesterday.ip).positive ? 'text-green-600' : 'text-red-600'"
                      >
                        ({{ calculateChange(stat.today.ip, stat.yesterday.ip).positive ? '+' : '-' }}{{ calculateChange(stat.today.ip, stat.yesterday.ip).value }}%)
                      </span>
                    </TableCell>
                    <TableCell>
                      <div class="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          class="h-7 px-2 text-xs"
                        >
                          查看报表
                        </Button>
                      </div>
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
                      {{ formatNumber(stat.yesterday.pv) }}
                    </TableCell>
                    <TableCell class="text-right text-sm text-muted-foreground">
                      {{ formatNumber(stat.yesterday.uv) }}
                    </TableCell>
                    <TableCell class="text-right text-sm text-muted-foreground">
                      {{ formatNumber(stat.yesterday.ip) }}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        @click="deleteDomain(stat.id, stat.domain)"
                      >
                        <Trash2 class="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                </template>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  </main>
</template>
