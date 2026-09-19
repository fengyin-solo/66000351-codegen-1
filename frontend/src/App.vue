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
          <button @click="openExportDialog" :disabled="!store.parsed" class="w-full mt-2 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed">导出分析报告</button>
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
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-sm font-bold text-slate-400 mb-3">历史报告</h3>
          <div v-if="!store.reports.length" class="text-xs text-slate-600">暂无导出的报告</div>
          <div v-else class="space-y-2 max-h-64 overflow-y-auto">
            <div v-for="r in store.reports" :key="r.id" class="rounded border border-slate-700 p-2 text-xs hover:border-slate-500">
              <div class="flex items-center justify-between gap-2">
                <button @click="viewingReportId = r.id" class="font-bold text-cyan-300 hover:text-cyan-200 truncate text-left" :title="r.name">{{ r.name }}</button>
                <button @click="store.deleteReport(r.id)" class="text-slate-500 hover:text-red-400 shrink-0">删除</button>
              </div>
              <div class="flex justify-between mt-1 text-slate-500">
                <span>{{ formatTime(r.createdAt) }}</span>
                <span>{{ r.includePlan ? '含执行计划' : '不含计划' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="lg:w-3/5 space-y-4">
        <div v-if="store.exportFailure" class="bg-amber-900/30 border border-amber-600 rounded-lg p-3 text-xs">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-amber-300">⚠ 上次导出「{{ store.exportFailure.name }}」在【{{ store.exportFailure.stage }}】阶段被中断：{{ store.exportFailure.message }}</span>
            <span class="ml-auto flex gap-2">
              <button @click="retryExport" class="px-2 py-1 bg-amber-600 hover:bg-amber-500 rounded text-white font-bold">重新发起</button>
              <button @click="store.dismissExportFailure" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300">忽略</button>
            </span>
          </div>
          <div v-if="retryMessage" class="mt-2 text-amber-400">{{ retryMessage }}</div>
        </div>
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
      </div>
    </div>
    <div v-if="showExportDialog" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div class="bg-slate-800 border border-slate-600 rounded-lg p-5 w-full max-w-md">
        <h3 class="text-sm font-bold text-slate-300 mb-4">导出分析报告</h3>
        <label class="block text-xs text-slate-500 mb-1">报告名称</label>
        <input v-model="exportName" @input="exportError = ''" @keyup.enter="confirmExport" class="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500" placeholder="输入报告名称" />
        <label class="flex items-center gap-2 mt-3 text-xs text-slate-400 cursor-pointer">
          <input type="checkbox" v-model="exportIncludePlan" class="accent-cyan-500" /> 附上执行计划明细
        </label>
        <div v-if="exportError" class="mt-3 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded p-2">{{ exportError }}</div>
        <div class="flex justify-end gap-2 mt-4">
          <button @click="showExportDialog = false" class="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded">取消</button>
          <button @click="confirmExport" class="px-3 py-1.5 text-xs bg-cyan-600 hover:bg-cyan-500 rounded font-bold">确认导出</button>
        </div>
      </div>
    </div>
    <div v-if="viewingReport" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" @click.self="viewingReportId = null">
      <div class="bg-slate-800 border border-slate-600 rounded-lg p-5 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-1">
          <h3 class="text-sm font-bold text-cyan-300">{{ viewingReport.name }}</h3>
          <button @click="viewingReportId = null" class="text-slate-500 hover:text-slate-300">✕</button>
        </div>
        <div class="text-xs text-slate-500 mb-4">导出于 {{ formatTime(viewingReport.createdAt) }}</div>
        <div class="space-y-4">
          <div>
            <div class="text-xs text-slate-500 mb-1">语句原文</div>
            <pre class="bg-slate-900 rounded p-3 text-xs font-mono text-green-400 whitespace-pre-wrap">{{ viewingReport.sql }}</pre>
          </div>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div class="bg-slate-900 rounded p-2 text-center"><div class="text-xs text-slate-500 mb-1">复杂度结论</div><div class="font-bold" :class="complexityColor(viewingReport.complexityLabel)">{{ viewingReport.complexityLabel }}（{{ viewingReport.complexity }}）</div></div>
            <div class="bg-slate-900 rounded p-2 text-center"><div class="text-xs text-slate-500 mb-1">语句类型</div><div class="text-cyan-400 font-bold">{{ viewingReport.type }}</div></div>
          </div>
          <div>
            <div class="text-xs text-slate-500 mb-1">涉及的表</div>
            <div class="flex flex-wrap gap-2">
              <span v-for="t in viewingReport.tables" :key="t" class="px-2 py-1 bg-blue-900/30 border border-blue-700 rounded text-xs text-blue-300">{{ t }}</span>
              <span v-if="!viewingReport.tables.length" class="text-xs text-slate-600">无</span>
            </div>
          </div>
          <div>
            <div class="text-xs text-slate-500 mb-1">优化建议</div>
            <div v-if="viewingReport.suggestions.length" class="space-y-1">
              <div v-for="(s, i) in viewingReport.suggestions" :key="i" class="text-xs flex items-start gap-2 bg-orange-900/30 border border-orange-700 rounded p-2">
                <span class="text-orange-400">{{ i + 1 }}.</span><span class="text-orange-300">{{ s }}</span>
              </div>
            </div>
            <div v-else class="text-xs text-green-400 bg-green-900/20 border border-green-700 rounded p-2">✓ 未发现明显性能问题</div>
          </div>
          <div v-if="viewingReport.includePlan && viewingReport.plan">
            <div class="text-xs text-slate-500 mb-1">执行计划明细</div>
            <div class="bg-slate-900 rounded p-3 overflow-x-auto">
              <div class="font-mono text-xs text-slate-300 space-y-1">
                <PlanNode :node="viewingReport.plan" :depth="0" />
              </div>
            </div>
          </div>
          <div v-else class="text-xs text-slate-600">未附执行计划明细</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, defineComponent, h } from 'vue'
import { useSQLStore, SQL_TEMPLATES, SCHEMA_TABLES } from './store/sql'

const store = useSQLStore()
const erCanvasRef = ref<HTMLCanvasElement | null>(null)

const showExportDialog = ref(false)
const exportName = ref('')
const exportIncludePlan = ref(true)
const exportError = ref('')
const viewingReportId = ref<string | null>(null)
const retryMessage = ref('')
const viewingReport = computed(() => store.reports.find(r => r.id === viewingReportId.value) || null)

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function complexityColor(label: string) {
  return label === '简单' ? 'text-green-400' : label === '中等' ? 'text-yellow-400' : label === '复杂' ? 'text-orange-400' : 'text-red-400'
}

function openExportDialog() {
  exportName.value = `分析报告-${new Date().toLocaleString('zh-CN', { hour12: false })}`
  exportIncludePlan.value = true
  exportError.value = ''
  showExportDialog.value = true
}

function confirmExport() {
  const result = store.exportReport(exportName.value, exportIncludePlan.value)
  if (result === 'ok') { showExportDialog.value = false; return }
  if (result === 'duplicate') exportError.value = '名称已存在，请改名后再导出'
  else if (result === 'empty') exportError.value = '请输入报告名称'
  else exportError.value = `导出失败：写入在【${store.exportFailure?.stage || '未知'}】阶段被中断，可通过页面提示重新发起`
}

function retryExport() {
  retryMessage.value = ''
  const result = store.retryExport()
  if (result === 'duplicate') retryMessage.value = '该名称已被其他报告占用，请忽略本次中断记录后换个名称重新导出'
  else if (result !== 'ok') retryMessage.value = '重试仍未完成，请稍后再试'
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
