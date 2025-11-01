<script setup>
import { Globe, Loader, Plus, Trash2, Calendar } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const domains = ref([])
const isLoading = ref(false)
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

onMounted(() => {
  loadDomains()
})
</script>

<template>
  <main class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <div class="flex items-center gap-2 mb-2">
          <Globe class="h-6 w-6 text-primary" />
          <h2 class="text-2xl font-bold">域名配置</h2>
        </div>
        <p class="text-sm text-muted-foreground">
          管理需要修改二级域名的域名列表
        </p>
      </div>
      <Button @click="showAddDialog = true" class="shadow-sm">
        <Plus class="mr-2 h-4 w-4" />
        添加域名
      </Button>
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

    <!-- 域名列表 -->
    <Card v-if="isLoading">
      <CardContent class="p-6">
        <div class="flex items-center justify-center">
          <Loader class="animate-spin h-6 w-6" />
        </div>
      </CardContent>
    </Card>

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

    <div
      v-else
      class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
    >
      <Card
        v-for="domain in domains"
        :key="domain.id"
        class="group hover:shadow-md transition-all duration-200 hover:border-primary/50"
      >
        <CardContent class="p-5">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3 flex-1 min-w-0">
              <Avatar class="h-10 w-10 shrink-0 border-2 border-background shadow-sm">
                <AvatarImage
                  :src="getDomainIcon(domain.domain)"
                  :alt="domain.domain"
                  loading="lazy"
                />
                <AvatarFallback class="bg-gradient-to-br from-primary/20 to-primary/10">
                  <Globe class="h-5 w-5 text-primary" />
                </AvatarFallback>
              </Avatar>
              
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="font-semibold text-base truncate">
                    {{ domain.domain }}
                  </h3>
                </div>
                <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar class="h-3.5 w-3.5 shrink-0" />
                  <span class="truncate">
                    {{ new Date(domain.createdAt * 1000).toLocaleDateString('zh-CN', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    }) }}
                  </span>
                </div>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              class="shrink-0 h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
              @click="deleteDomain(domain.id, domain.domain)"
            >
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>
          
          <div class="mt-3 pt-3 border-t">
            <div class="flex items-center gap-2 text-xs text-muted-foreground">
              <div class="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span>二级域名替换已启用</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </main>
</template>
