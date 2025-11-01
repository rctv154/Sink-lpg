<script setup>
import { Download, Loader, CheckCircle2, XCircle, Link2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const emit = defineEmits(['update:link'])

const dialogOpen = ref(false)
const urlsInput = ref('')
const isCreating = ref(false)
const results = ref([])
const summary = ref({ total: 0, success: 0, failed: 0 })

const { origin } = location

// 解析输入的 URL 列表
function parseUrls() {
  const lines = urlsInput.value.split('\n').map(line => line.trim()).filter(line => line.length > 0)
  return lines
}

// 批量创建短链接
async function batchCreate() {
  const urls = parseUrls()
  
  if (urls.length === 0) {
    toast.error('请输入至少一个链接')
    return
  }

  if (urls.length > 100) {
    toast.error('一次最多创建 100 个链接')
    return
  }

  isCreating.value = true
  try {
    const data = await useAPI('/api/link/batch-create', {
      method: 'POST',
      body: {
        urls,
        autoSlug: true,
      },
    })

    results.value = data.results || []
    summary.value = data.summary || { total: 0, success: 0, failed: 0 }

    if (summary.value.success > 0) {
      toast.success(`成功创建 ${summary.value.success} 个短链接`)
      emit('update:link', null, 'batch-create')
    }

    if (summary.value.failed > 0) {
      toast.error(`${summary.value.failed} 个链接创建失败`)
    }
  }
  catch (error) {
    console.error(error)
    toast.error('批量创建失败')
  }
  finally {
    isCreating.value = false
  }
}

// 重置表单
function reset() {
  urlsInput.value = ''
  results.value = []
  summary.value = { total: 0, success: 0, failed: 0 }
}

// 导出结果为 CSV
function exportResults() {
  if (results.value.length === 0) {
    toast.error('没有可导出的数据')
    return
  }

  try {
    const headers = ['状态', '原始链接', '短链接', '短链 Slug', '错误信息']
    const rows = results.value.map(result => [
      result.success ? '成功' : '失败',
      result.url,
      result.shortLink || '-',
      result.slug || '-',
      result.error || '-',
    ])

    // 转换为 CSV 格式
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n')

    // 添加 BOM 以支持中文
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })

    // 生成文件名
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    const filename = `批量创建结果_${dateStr}.csv`

    // 下载文件
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success('结果导出成功')
  }
  catch (error) {
    console.error('导出失败:', error)
    toast.error('导出失败')
  }
}

// 复制所有成功的短链接
function copyAllShortLinks() {
  const successLinks = results.value.filter(r => r.success).map(r => r.shortLink).join('\n')
  
  if (!successLinks) {
    toast.error('没有可复制的短链接')
    return
  }

  navigator.clipboard.writeText(successLinks).then(() => {
    toast.success('已复制所有短链接到剪贴板')
  }).catch(() => {
    toast.error('复制失败')
  })
}

// 关闭对话框时重置
watch(dialogOpen, (newVal) => {
  if (!newVal && results.value.length > 0) {
    // 延迟重置，避免关闭动画时看到重置效果
    setTimeout(reset, 300)
  }
})
</script>

<template>
  <Dialog v-model:open="dialogOpen">
    <DialogTrigger as-child>
      <slot>
        <Button variant="outline">
          <Link2 class="mr-2 h-4 w-4" />
          批量生成
        </Button>
      </slot>
    </DialogTrigger>
    <DialogContent class="max-w-[95svw] max-h-[95svh] md:max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto]">
      <DialogHeader>
        <DialogTitle>批量生成短链接</DialogTitle>
        <DialogDescription>
          每行输入一个链接，最多支持 100 个链接
        </DialogDescription>
      </DialogHeader>

      <div v-if="results.length === 0" class="space-y-4 overflow-y-auto px-2">
        <!-- 输入区域 -->
        <div class="space-y-2">
          <Label for="urls">链接列表</Label>
          <Textarea
            id="urls"
            v-model="urlsInput"
            placeholder="https://example.com/page1&#10;https://example.com/page2&#10;https://example.com/page3"
            rows="15"
            class="font-mono text-sm"
          />
          <p class="text-xs text-muted-foreground">
            已输入 {{ parseUrls().length }} 个链接
          </p>
        </div>
      </div>

      <!-- 结果显示区域 -->
      <div v-else class="space-y-4 overflow-y-auto px-2">
        <!-- 汇总信息 -->
        <div class="grid grid-cols-3 gap-4">
          <Card>
            <CardContent class="pt-6">
              <div class="text-center">
                <p class="text-2xl font-bold">{{ summary.total }}</p>
                <p class="text-xs text-muted-foreground">总计</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="pt-6">
              <div class="text-center">
                <p class="text-2xl font-bold text-green-600">{{ summary.success }}</p>
                <p class="text-xs text-muted-foreground">成功</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="pt-6">
              <div class="text-center">
                <p class="text-2xl font-bold text-red-600">{{ summary.failed }}</p>
                <p class="text-xs text-muted-foreground">失败</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- 结果列表 -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label>生成结果</Label>
            <div class="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                @click="copyAllShortLinks"
                :disabled="summary.success === 0"
              >
                复制短链接
              </Button>
              <Button
                variant="outline"
                size="sm"
                @click="exportResults"
              >
                <Download class="mr-2 h-3 w-3" />
                导出结果
              </Button>
            </div>
          </div>
          <div class="border rounded-lg overflow-hidden">
            <div class="max-h-96 overflow-y-auto">
              <div
                v-for="(result, index) in results"
                :key="index"
                class="p-3 border-b last:border-b-0 hover:bg-muted/50"
                :class="{
                  'bg-green-50 dark:bg-green-950/20': result.success,
                  'bg-red-50 dark:bg-red-950/20': !result.success,
                }"
              >
                <div class="flex items-start gap-3">
                  <div class="shrink-0 mt-0.5">
                    <CheckCircle2
                      v-if="result.success"
                      class="h-5 w-5 text-green-600"
                    />
                    <XCircle
                      v-else
                      class="h-5 w-5 text-red-600"
                    />
                  </div>
                  <div class="flex-1 min-w-0 space-y-1">
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-medium text-muted-foreground">
                        #{{ index + 1 }}
                      </span>
                      <span
                        v-if="result.success"
                        class="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full"
                      >
                        成功
                      </span>
                      <span
                        v-else
                        class="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full"
                      >
                        失败
                      </span>
                    </div>
                    <p class="text-sm font-mono truncate" :title="result.url">
                      {{ result.url }}
                    </p>
                    <p
                      v-if="result.success"
                      class="text-sm font-medium text-blue-600 dark:text-blue-400 truncate"
                      :title="result.shortLink"
                    >
                      {{ result.shortLink }}
                    </p>
                    <p
                      v-else
                      class="text-sm text-red-600 dark:text-red-400"
                    >
                      {{ result.error }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <template v-if="results.length === 0">
          <DialogClose as-child>
            <Button
              type="button"
              variant="secondary"
            >
              取消
            </Button>
          </DialogClose>
          <Button
            @click="batchCreate"
            :disabled="isCreating || parseUrls().length === 0"
          >
            <Loader v-if="isCreating" class="mr-2 h-4 w-4 animate-spin" />
            {{ isCreating ? '创建中...' : '开始生成' }}
          </Button>
        </template>
        <template v-else>
          <Button
            variant="secondary"
            @click="reset"
          >
            继续创建
          </Button>
          <DialogClose as-child>
            <Button>
              完成
            </Button>
          </DialogClose>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

