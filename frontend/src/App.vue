<template>
  <div class="min-h-screen bg-slate-900 text-slate-200">
    <header class="border-b border-slate-700 px-6 py-4">
      <h1 class="text-2xl font-bold text-cyan-400">SQL 查询可视化与执行计划分析器</h1>
      <p class="text-sm text-slate-500 mt-1">SQL语法解析 · 执行计划树 · ER图 · 复杂度评分 · 优化建议</p>
    </header>
    <div class="flex flex-col lg:flex-row gap-4 p-4">
      <div class="lg:w-2/5 space-y-4">
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-bold text-slate-400">SQL 编辑器</h3>
            <div class="flex gap-2">
              <select @change="(e) => { store.sql = SQL_TEMPLATES[+(e.target as HTMLSelectElement).value].sql }" class="text-xs bg-slate-900 border border-slate-600 rounded px-2 py-1 text-slate-300">
                <option v-for="(t, i) in SQL_TEMPLATES" :key="i" :value="i">{{ t.name }}</option>
              </select>
            </div>
          </div>
          <textarea v-model="store.sql" rows="12" class="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm font-mono text-green-400 focus:outline-none focus:border-cyan-500 resize-none"></textarea>
          <button @click="store.analyze" class="w-full mt-3 py-2 bg-cyan-600 hover:bg-cyan-500 rounded text-sm font-bold">分析查询</button>
        </div>
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-sm font-bold text-slate-400 mb-3">数据库 Schema</h3>
          <div class="space-y-2">
            <div v-for="t in SCHEMA_TABLES" :key="t.name" @click="store.activeSchema = store.activeSchema?.name === t.name ? null : t"
              :class="['cursor-pointer rounded border p-2 text-xs transition-all', store.activeSchema?.name === t.name ? 'border-cyan-500 bg-cyan-900/20' : 'border-slate-700 hover:border-slate-500']">
              <div class="flex justify-between items-center">
                <span class="font-bold text-slate-200">{{ t.name }}</span>
                <span class="text-slate-500">{{ t.rowCount.toLocaleString() }} 行</span>
              </div>
              <div v-if="store.activeSchema?.name === t.name" class="mt-2 space-y-0.5">
                <div v-for="c in t.columns" :key="c.name" class="flex gap-2">
                  <span :class="c.pk ? 'text-yellow-400' : c.fk ? 'text-blue-400' : 'text-slate-400'">{{ c.pk ? '🔑 ' : c.fk ? '🔗 ' : '  ' }}{{ c.name }}</span>
                  <span class="text-slate-600">{{ c.type }}</span>
                  <span v-if="c.fk" class="text-blue-600">→ {{ c.fk }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="lg:w-3/5 space-y-4">
        <div v-if="store.parsed" class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-sm font-bold text-slate-400 mb-3">查询解析结果</h3>
          <div class="grid grid-cols-4 gap-3 text-sm mb-4">
            <div class="bg-slate-900 rounded p-2 text-center"><div class="text-xs text-slate-500 mb-1">类型</div><div class="text-cyan-400 font-bold">{{ store.parsed.type }}</div></div>
            <div class="bg-slate-900 rounded p-2 text-center"><div class="text-xs text-slate-500 mb-1">复杂度</div><div class="font-bold" :class="store.complexityLabel.color">{{ store.complexityLabel.label }}</div></div>
            <div class="bg-slate-900 rounded p-2 text-center"><div class="text-xs text-slate-500 mb-1">JOIN数</div><div class="text-orange-400 font-bold">{{ store.parsed.joins.length }}</div></div>
            <div class="bg-slate-900 rounded p-2 text-center"><div class="text-xs text-slate-500 mb-1">预估行数</div><div class="text-purple-400 font-bold">{{ store.parsed.estimatedCost }}</div></div>
          </div>
          <div v-if="store.parsed.suggestions.length" class="space-y-1">
            <div class="text-xs text-slate-500 mb-1">优化建议</div>
            <div v-for="(s, i) in store.parsed.suggestions" :key="i" class="text-xs flex items-start gap-2 bg-orange-900/30 border border-orange-700 rounded p-2">
              <span class="text-orange-400">⚠</span><span class="text-orange-300">{{ s }}</span>
            </div>
          </div>
          <div v-else class="text-xs text-green-400 bg-green-900/20 border border-green-700 rounded p-2">✓ 未发现明显性能问题</div>
        </div>
        <div v-if="store.plan" class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-sm font-bold text-slate-400 mb-3">执行计划树</h3>
          <div class="overflow-x-auto">
            <div class="font-mono text-xs text-slate-300 space-y-1">
              <PlanNode :node="store.plan" :depth="0" />
            </div>
          </div>
        </div>
        <div v-if="store.parsed" class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-sm font-bold text-slate-400 mb-3">涉及表与关联关系</h3>
          <canvas ref="erCanvasRef" class="w-full bg-slate-900 rounded" style="height:200px"></canvas>
        </div>
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-bold text-slate-400">分析报告导出与历史</h3>
            <button @click="openExport" :disabled="!store.parsed"
              class="text-xs px-3 py-1.5 rounded font-bold bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed">
              导出当前分析
            </button>
          </div>
          <div v-if="reportStore.interrupted" class="mb-3 text-xs bg-red-900/30 border border-red-700 rounded p-2 flex items-center justify-between gap-2">
            <span class="text-red-300">
              ⚠ 上次导出「{{ reportStore.interrupted.name }}」在「{{ EXPORT_STAGE_LABELS[reportStore.interrupted.stage] }}」处{{ reportStore.interrupted.error ? '失败' : '中断' }}，可再次发起。
            </span>
            <span class="flex gap-2 shrink-0">
              <button @click="retryExport" class="px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-red-100 font-bold">重试</button>
              <button @click="reportStore.discardInterrupted" class="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300">丢弃</button>
            </span>
          </div>
          <div v-if="!reportStore.reports.length" class="text-xs text-slate-500">暂无历史报告，导出后可在此按名称查看。</div>
          <div v-else class="space-y-2">
            <div v-for="r in reportStore.reports" :key="r.id" class="flex items-center justify-between rounded border border-slate-700 px-3 py-2">
              <div class="min-w-0">
                <button @click="openReport(r)" class="text-sm text-cyan-400 hover:text-cyan-300 font-bold truncate block">{{ r.name }}</button>
                <div class="text-xs text-slate-500">
                  {{ formatTime(r.createdAt) }} · {{ r.queryType }} · 复杂度{{ r.complexityLabel }}{{ r.includePlan ? ' · 含执行计划' : '' }}
                </div>
              </div>
              <div class="flex gap-2 shrink-0 ml-3">
                <button @click="openReport(r)" class="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200">查看</button>
                <button @click="removeReport(r)" class="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-red-700 text-slate-300 hover:text-red-100">删除</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-if="showExport" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div class="w-full max-w-md bg-slate-800 border border-slate-600 rounded-lg p-5 space-y-4">
        <h3 class="text-sm font-bold text-slate-300">导出分析报告</h3>
        <div>
          <label class="block text-xs text-slate-500 mb-1">报告名称</label>
          <input v-model="exportName" type="text" placeholder="为这份报告命名"
            class="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500" />
        </div>
        <label class="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input v-model="includePlan" type="checkbox" class="accent-cyan-500" />
          附上执行计划明细
        </label>
        <p class="text-xs text-slate-500">报告将保存语句原文、复杂度结论、涉及表与逐条优化建议。</p>
        <div v-if="exportError" class="text-xs text-red-300 bg-red-900/30 border border-red-700 rounded p-2">{{ exportError }}</div>
        <div class="flex justify-end gap-2">
          <button @click="showExport = false" class="px-3 py-1.5 rounded text-xs bg-slate-700 hover:bg-slate-600 text-slate-300">取消</button>
          <button @click="confirmExport" class="px-3 py-1.5 rounded text-xs font-bold bg-cyan-600 hover:bg-cyan-500">确认导出</button>
        </div>
      </div>
    </div>
    <div v-if="viewing" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div class="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-slate-800 border border-slate-600 rounded-lg p-5 space-y-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-base font-bold text-cyan-400">{{ viewing.name }}</h3>
            <p class="text-xs text-slate-500 mt-1">导出于 {{ formatTime(viewing.createdAt) }}（内容为导出当时的分析结论）</p>
          </div>
          <button @click="viewing = null" class="text-slate-400 hover:text-slate-200 text-lg leading-none">✕</button>
        </div>
        <div>
          <div class="text-xs text-slate-500 mb-1">语句原文</div>
          <pre class="bg-slate-900 rounded p-3 text-xs font-mono text-green-400 whitespace-pre-wrap">{{ viewing.sql }}</pre>
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="bg-slate-900 rounded p-2 text-center">
            <div class="text-xs text-slate-500 mb-1">复杂度结论</div>
            <div class="font-bold text-cyan-400">{{ viewing.complexityLabel }}（{{ viewing.complexity }}）</div>
          </div>
          <div class="bg-slate-900 rounded p-2 text-center">
            <div class="text-xs text-slate-500 mb-1">查询类型</div>
            <div class="font-bold text-slate-200">{{ viewing.queryType }}</div>
          </div>
        </div>
        <div>
          <div class="text-xs text-slate-500 mb-1">涉及表</div>
          <div class="flex flex-wrap gap-2">
            <span v-for="t in viewing.tables" :key="t" class="text-xs bg-blue-900/40 border border-blue-700 text-blue-300 rounded px-2 py-1">{{ t }}</span>
            <span v-if="!viewing.tables.length" class="text-xs text-slate-500">无</span>
          </div>
        </div>
        <div>
          <div class="text-xs text-slate-500 mb-1">优化建议</div>
          <div v-if="viewing.suggestions.length" class="space-y-1">
            <div v-for="(s, i) in viewing.suggestions" :key="i" class="text-xs flex items-start gap-2 bg-orange-900/30 border border-orange-700 rounded p-2">
              <span class="text-orange-400">{{ i + 1 }}.</span><span class="text-orange-300">{{ s }}</span>
            </div>
          </div>
          <div v-else class="text-xs text-green-400 bg-green-900/20 border border-green-700 rounded p-2">✓ 未发现明显性能问题</div>
        </div>
        <div v-if="viewing.includePlan && viewing.plan">
          <div class="text-xs text-slate-500 mb-1">执行计划明细</div>
          <div class="bg-slate-900 rounded p-3 font-mono text-xs text-slate-300 overflow-x-auto">
            <PlanNode :node="viewing.plan" :depth="0" />
          </div>
        </div>
        <div v-else class="text-xs text-slate-500">未附执行计划明细</div>
      </div>
    </div>
    <div v-if="toast" class="fixed bottom-4 right-4 z-50 bg-slate-800 border border-cyan-600 text-cyan-300 text-xs rounded px-4 py-2 shadow-lg">{{ toast }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, defineComponent, h } from 'vue'
import { useSQLStore, SQL_TEMPLATES, SCHEMA_TABLES } from './store/sql'
import { useReportStore, EXPORT_STAGE_LABELS } from './store/reports'
import type { AnalysisReport } from './store/reports'

const store = useSQLStore()
const reportStore = useReportStore()
const erCanvasRef = ref<HTMLCanvasElement | null>(null)

const showExport = ref(false)
const exportName = ref('')
const includePlan = ref(true)
const exportError = ref('')
const viewing = ref<AnalysisReport | null>(null)
const toast = ref('')

let toastTimer: number | undefined
function showToast(msg: string) {
  toast.value = msg
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.value = '' }, 3000)
}

function openExport() {
  if (!store.parsed) return
  exportName.value = `分析报告-${new Date().toLocaleString('zh-CN', { hour12: false })}`
  includePlan.value = true
  exportError.value = ''
  showExport.value = true
}

function confirmExport() {
  const name = exportName.value.trim()
  if (!name) { exportError.value = '请输入报告名称'; return }
  if (reportStore.nameExists(name)) { exportError.value = `名称「${name}」已存在，请改名后再导出`; return }
  const p = store.parsed!
  // 深拷贝快照：之后再分析同一段语句也不影响这份报告
  const report: AnalysisReport = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: Date.now(),
    sql: store.sql,
    queryType: p.type,
    complexity: p.complexity,
    complexityLabel: store.complexityLabel.label,
    tables: [...p.tables],
    suggestions: [...p.suggestions],
    includePlan: includePlan.value,
    plan: includePlan.value && store.plan ? JSON.parse(JSON.stringify(store.plan)) : null,
  }
  const res = reportStore.exportReport(report)
  if (res.ok) {
    showExport.value = false
    showToast(`报告「${name}」已导出`)
  } else if (reportStore.staging) {
    // 写入中途失败：失败位置由中断横幅标明，可再次发起
    showExport.value = false
    showToast(res.error || '导出失败')
  } else {
    exportError.value = res.error || '导出失败'
  }
}

function retryExport() {
  const res = reportStore.retryExport()
  showToast(res.ok ? '已从中断处继续，导出成功' : res.error || '重试失败')
}

function openReport(r: AnalysisReport) {
  viewing.value = r
}

function removeReport(r: AnalysisReport) {
  reportStore.removeReport(r.id)
  if (viewing.value?.id === r.id) viewing.value = null
  showToast(`报告「${r.name}」已删除`)
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

const PlanNode = defineComponent({
  props: { node: Object, depth: Number },
  setup(props) {
    return () => {
      if (!props.node) return null
      const n = props.node as any
      const indent = '  '.repeat(props.depth || 0)
      const opColor = n.operation.includes('Scan') ? '#22c55e' : n.operation.includes('Join') ? '#f97316' : n.operation.includes('Sort') ? '#8b5cf6' : '#06b6d4'
      return h('div', [
        h('div', { style: `padding-left: ${(props.depth || 0) * 20}px` }, [
          h('span', { style: 'color: #475569' }, indent.replace(/\s\s/g, '│ ').replace(/│ $/, '└─')),
          h('span', { style: `color: ${opColor}; font-weight: bold` }, n.operation),
          n.table ? h('span', { style: 'color: #94a3b8' }, ` on ${n.table}`) : null,
          n.index ? h('span', { style: 'color: #eab308' }, ` [${n.index}]`) : null,
          h('span', { style: 'color: #64748b' }, ` cost=${n.cost.toFixed(1)} rows=${n.rows}`),
        ]),
        ...(n.children || []).map((child: any) => h(PlanNode, { node: child, depth: (props.depth || 0) + 1 }))
      ])
    }
  }
})

function drawER() {
  const canvas = erCanvasRef.value
  if (!canvas || !store.parsed) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const tables = store.parsed.tables
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  canvas.width = canvas.clientWidth
  canvas.height = 200
  const W = canvas.width, H = 200
  const spacing = W / (tables.length + 1)
  const positions: Record<string, { x: number; y: number }> = {}
  tables.forEach((t, i) => { positions[t] = { x: spacing * (i + 1), y: H / 2 } })

  // Draw joins
  store.parsed.joins.forEach(j => {
    const src = positions[tables[0]]
    const dst = positions[j.table]
    if (!src || !dst) return
    ctx.beginPath()
    ctx.moveTo(src.x, src.y)
    ctx.lineTo(dst.x, dst.y)
    ctx.strokeStyle = '#f97316'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.stroke()
    ctx.setLineDash([])
    const mx = (src.x + dst.x) / 2, my = (src.y + dst.y) / 2
    ctx.fillStyle = '#f97316'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(j.type, mx, my - 5)
  })

  // Draw table boxes
  tables.forEach((t, i) => {
    const pos = positions[t]
    if (!pos) return
    const x = pos.x, y = pos.y
    ctx.fillStyle = '#1e293b'
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(x - 50, y - 30, 100, 60, 6)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#06b6d4'
    ctx.font = 'bold 13px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(t, x, y - 10)
    const schema = SCHEMA_TABLES.find(s => s.name === t)
    if (schema) {
      ctx.fillStyle = '#64748b'
      ctx.font = '10px monospace'
      ctx.fillText(schema.rowCount.toLocaleString() + ' rows', x, y + 10)
    }
  })
}

onMounted(() => { store.analyze(); setTimeout(drawER, 200) })
watch(() => store.parsed, () => setTimeout(drawER, 100), { deep: true })
</script>
