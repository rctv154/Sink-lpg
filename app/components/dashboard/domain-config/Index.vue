<script setup>
import { Loader, Plus, Trash2 } from 'lucide-vue-next'
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

async function deleteDomain(domainId) {
  if (!confirm('确定要删除这个域名吗？')) {
    return
  }

  try {
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
    console.error(error)
    if (error?.data?.statusMessage) {
      toast.error(error.data.statusMessage)
    }
    else {
      toast.error('删除失败')
    }
  }
}

onMounted(() => {
  loadDomains()
})
</script>

<template>
  <main class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold">域名配置</h2>
        <p class="text-sm text-muted-foreground mt-1">
          管理需要修改二级域名的域名列表
        </p>
      </div>
      <Button @click="showAddDialog = true">
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

    <Card v-else-if="domains.length === 0">
      <CardContent class="p-6">
        <div class="text-center text-muted-foreground">
          <p>暂无域名配置</p>
          <p class="text-sm mt-2">
            点击"添加域名"按钮添加需要修改二级域名的域名
          </p>
        </div>
      </CardContent>
    </Card>

    <div
      v-else
      class="space-y-4"
    >
      <Card
        v-for="domain in domains"
        :key="domain.id"
      >
        <CardContent class="p-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-4">
              <div>
                <p class="font-medium">
                  {{ domain.domain }}
                </p>
                <p class="text-sm text-muted-foreground">
                  添加时间：{{ new Date(domain.createdAt * 1000).toLocaleString('zh-CN') }}
                </p>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              @click="deleteDomain(domain.id)"
            >
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </main>
</template>

