<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Check, Copy, KeyRound, Loader2, Plus, RefreshCw, Shield, Trash2 } from 'lucide-vue-next'
import {
  ApiError,
  oauthAdminApi,
  type OAuthClientRecord,
  type OAuthClientWithSecret,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { confirmAction } from '../lib/confirm'
import AdminWorkspaceNav from './AdminWorkspaceNav.vue'
import ActionNotice from './ui/ActionNotice.vue'
import RefreshButton from './ui/RefreshButton.vue'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'

const { isAdmin, ensureLoaded } = useAuth()
const clients = ref<OAuthClientRecord[]>([])
const loading = ref(true)
const refreshing = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const copiedKey = ref('')
const revealedSecret = ref<{ name: string; clientId: string; secret: string } | null>(null)

const creating = ref(false)
const formName = ref('')
const formDesc = ref('')
const formRedirectUris = ref('http://127.0.0.1/callback')
const formIsPublic = ref(false)
const formRequireCampus = ref(true)
const formScopes = ref<string[]>(['profile', 'campus', 'nowcoder'])

const ALL_SCOPES = [
  { key: 'profile', label: 'profile（学号/姓名/角色）' },
  { key: 'campus', label: 'campus（年级/学院/班级）' },
  { key: 'nowcoder', label: 'nowcoder（已绑定牛客号）' },
] as const

function errMsg(err: unknown): string {
  return err instanceof ApiError ? err.message : '操作失败，请稍后重试'
}

async function load(isRefresh = false) {
  if (isRefresh) refreshing.value = true
  else loading.value = true
  error.value = ''
  try {
    clients.value = await oauthAdminApi.list()
  } catch (err) {
    error.value = errMsg(err)
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

onMounted(async () => {
  await ensureLoaded()
  if (isAdmin.value) await load()
  else loading.value = false
})

function toggleScope(key: string) {
  if (formScopes.value.includes(key)) {
    formScopes.value = formScopes.value.filter((s) => s !== key)
  } else {
    formScopes.value = [...formScopes.value, key]
  }
}

async function createClient() {
  if (busy.value) return
  const name = formName.value.trim()
  const uris = formRedirectUris.value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!name) {
    error.value = '请填写应用名称'
    return
  }
  if (!uris.length) {
    error.value = '至少需要一个回调地址'
    return
  }
  if (!formScopes.value.length) {
    error.value = '至少选择一个授权范围'
    return
  }

  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const created: OAuthClientWithSecret = await oauthAdminApi.create({
      name,
      description: formDesc.value.trim(),
      redirect_uris: uris,
      allowed_scopes: formScopes.value,
      is_public: formIsPublic.value,
      require_campus: formRequireCampus.value,
    })
    creating.value = false
    formName.value = ''
    formDesc.value = ''
    formRedirectUris.value = 'http://127.0.0.1/callback'
    if (created.client_secret) {
      revealedSecret.value = {
        name: created.name,
        clientId: created.client_id,
        secret: created.client_secret,
      }
    }
    notice.value = `已创建应用「${created.name}」`
    await load(true)
  } catch (err) {
    error.value = errMsg(err)
  } finally {
    busy.value = false
  }
}

async function toggleActive(item: OAuthClientRecord) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await oauthAdminApi.update(item.id, { is_active: !item.is_active })
    notice.value = item.is_active ? `已停用「${item.name}」` : `已启用「${item.name}」`
    await load(true)
  } catch (err) {
    error.value = errMsg(err)
  } finally {
    busy.value = false
  }
}

async function rotateSecret(item: OAuthClientRecord) {
  if (busy.value || item.is_public) return
  if (!(await confirmAction(`确定为「${item.name}」轮换客户端密钥吗？旧密钥将立即失效。`, '轮换密钥'))) {
    return
  }
  busy.value = true
  error.value = ''
  try {
    const res = await oauthAdminApi.rotateSecret(item.id)
    if (res.client_secret) {
      revealedSecret.value = {
        name: res.name,
        clientId: res.client_id,
        secret: res.client_secret,
      }
    }
    notice.value = '已生成新密钥，请立即保存'
  } catch (err) {
    error.value = errMsg(err)
  } finally {
    busy.value = false
  }
}

async function removeClient(item: OAuthClientRecord) {
  if (busy.value) return
  if (!(await confirmAction(`确定删除应用「${item.name}」？已签发令牌将失效。`, '删除 OAuth 应用'))) {
    return
  }
  busy.value = true
  error.value = ''
  try {
    await oauthAdminApi.remove(item.id)
    notice.value = `已删除「${item.name}」`
    await load(true)
  } catch (err) {
    error.value = errMsg(err)
  } finally {
    busy.value = false
  }
}

async function copyText(key: string, value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copiedKey.value = key
    window.setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = ''
    }, 1500)
  } catch {
    error.value = '无法复制到剪贴板，请手动选中复制'
  }
}
</script>

<template>
  <div class="page-shell">
    <AdminWorkspaceNav active="oauth">
      <RefreshButton :busy="refreshing" @click="load(true)" />
      <Button v-if="isAdmin" size="sm" @click="creating = !creating">
        <Plus class="mr-1.5 h-4 w-4" />
        {{ creating ? '收起表单' : '新建应用' }}
      </Button>
    </AdminWorkspaceNav>

    <div v-if="loading" class="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <Loader2 class="h-4 w-4 animate-spin" />
      正在加载 OAuth 应用…
    </div>

    <div v-else-if="!isAdmin" class="surface-card p-6 text-center text-sm text-muted-foreground">
      仅管理员可管理 OAuth 授权应用。
    </div>

    <template v-else>
      <ActionNotice :message="error" variant="error" />
      <ActionNotice :message="notice" variant="success" />

      <Card v-if="revealedSecret" class="border-amber-500/40 bg-amber-500/5">
        <CardHeader class="pb-3">
          <CardTitle class="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
            <KeyRound class="h-4 w-4" />
            请立即复制并妥善保存「{{ revealedSecret.name }}」的客户端密钥（关闭后不再显示）
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-2 text-xs">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-muted-foreground">Client ID：</span>
            <code class="rounded bg-background px-2 py-1 font-mono">{{ revealedSecret.clientId }}</code>
            <Button variant="outline" size="sm" @click="copyText('new-id', revealedSecret.clientId)">
              <Check v-if="copiedKey === 'new-id'" class="h-3.5 w-3.5" />
              <Copy v-else class="h-3.5 w-3.5" />
            </Button>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-muted-foreground">Client Secret：</span>
            <code class="break-all rounded bg-background px-2 py-1 font-mono">{{ revealedSecret.secret }}</code>
            <Button variant="outline" size="sm" @click="copyText('new-sec', revealedSecret.secret)">
              <Check v-if="copiedKey === 'new-sec'" class="h-3.5 w-3.5" />
              <Copy v-else class="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" class="mt-1" @click="revealedSecret = null">我已保存</Button>
        </CardContent>
      </Card>

      <Card v-if="creating">
        <CardHeader>
          <CardTitle class="text-base">注册新 OAuth 应用</CardTitle>
          <p class="text-sm text-muted-foreground">
            支持校赛服务端、监考后台及桌面客户端接入工作坊一键认证。桌面端可填写
            <code class="font-mono">http://127.0.0.1/callback</code>（自动匹配任意本机临时端口）。
          </p>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="space-y-1 text-sm">
              <span>应用名称</span>
              <Input v-model="formName" placeholder="如：校赛环境管理服务端" />
            </label>
            <label class="space-y-1 text-sm">
              <span>应用简介（可选）</span>
              <Input v-model="formDesc" placeholder="展示在用户授权确认页上" />
            </label>
          </div>

          <label class="block space-y-1 text-sm">
            <span>允许的回调地址（每行一个）</span>
            <textarea
              v-model="formRedirectUris"
              rows="3"
              class="form-textarea font-mono text-xs"
              placeholder="https://contest.example.com/oauth/callback&#10;http://127.0.0.1/callback"
            />
          </label>

          <div class="space-y-2">
            <span class="text-sm font-medium">允许申请的权限范围</span>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="s in ALL_SCOPES"
                :key="s.key"
                type="button"
                class="choice-button"
                :aria-pressed="formScopes.includes(s.key)"
                @click="toggleScope(s.key)"
              >
                {{ s.label }}
              </button>
            </div>
          </div>

          <div class="flex flex-wrap gap-5 text-sm">
            <label class="flex items-center gap-2">
              <input v-model="formIsPublic" type="checkbox" class="h-4 w-4 accent-primary" />
              公开客户端（无密钥，强制 PKCE）
            </label>
            <label class="flex items-center gap-2">
              <input v-model="formRequireCampus" type="checkbox" class="h-4 w-4 accent-primary" />
              仅限校内成员授权
            </label>
          </div>

          <div class="flex gap-2">
            <Button :disabled="busy" @click="createClient">
              <Loader2 v-if="busy" class="mr-2 h-4 w-4 animate-spin" />
              创建应用
            </Button>
            <Button variant="outline" :disabled="busy" @click="creating = false">取消</Button>
          </div>
        </CardContent>
      </Card>

      <div v-if="!clients.length" class="surface-card p-10 text-center text-sm text-muted-foreground">
        暂无已注册的 OAuth 应用，点击右上角「新建应用」开始接入。
      </div>

      <div v-else class="grid gap-3">
        <Card v-for="item in clients" :key="item.id">
          <CardContent class="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0 space-y-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-semibold">{{ item.name }}</span>
                <span
                  class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  :class="
                    item.is_active
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground'
                  "
                >
                  {{ item.is_active ? '启用中' : '已停用' }}
                </span>
                <span class="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {{ item.is_public ? '公开客户端 (PKCE)' : '机密客户端' }}
                </span>
                <span v-if="item.require_campus" class="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-700 dark:text-blue-300">
                  <Shield class="h-3 w-3" />仅校内
                </span>
              </div>
              <p v-if="item.description" class="text-xs text-muted-foreground">{{ item.description }}</p>
              <div class="flex flex-wrap items-center gap-1.5 text-xs">
                <span class="text-muted-foreground">Client ID：</span>
                <code class="rounded bg-muted px-1.5 py-0.5 font-mono">{{ item.client_id }}</code>
                <button
                  type="button"
                  class="inline-flex items-center text-muted-foreground hover:text-foreground"
                  @click="copyText(`cid-${item.id}`, item.client_id)"
                >
                  <Check v-if="copiedKey === `cid-${item.id}`" class="h-3.5 w-3.5 text-emerald-600" />
                  <Copy v-else class="h-3.5 w-3.5" />
                </button>
              </div>
              <div class="text-xs text-muted-foreground">
                回调白名单：
                <span v-for="(uri, idx) in item.redirect_uris" :key="uri" class="font-mono">
                  {{ idx > 0 ? ' · ' : '' }}{{ uri }}
                </span>
              </div>
              <div class="text-xs text-muted-foreground">
                Scopes：<span class="font-mono">{{ item.allowed_scopes.join(' ') }}</span>
              </div>
            </div>

            <div class="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" size="sm" :disabled="busy" @click="toggleActive(item)">
                {{ item.is_active ? '停用' : '启用' }}
              </Button>
              <Button v-if="!item.is_public" variant="outline" size="sm" :disabled="busy" @click="rotateSecret(item)">
                <RefreshCw class="mr-1.5 h-3.5 w-3.5" />
                轮换密钥
              </Button>
              <Button variant="outline" size="sm" class="text-destructive" :disabled="busy" @click="removeClient(item)">
                <Trash2 class="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </template>
  </div>
</template>
