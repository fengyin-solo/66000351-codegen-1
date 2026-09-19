import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { QueryPlan } from './sql'

export interface AnalysisReport {
  id: string
  name: string
  createdAt: number
  sql: string
  queryType: string
  complexity: number
  complexityLabel: string
  tables: string[]
  suggestions: string[]
  includePlan: boolean
  plan: QueryPlan | null
}

export type ExportStage = 'meta' | 'sql' | 'analysis' | 'plan' | 'commit'

export const EXPORT_STAGE_LABELS: Record<ExportStage, string> = {
  meta: '写入报告元信息',
  sql: '写入语句原文',
  analysis: '写入分析结论',
  plan: '写入执行计划明细',
  commit: '写入历史清单',
}

interface ExportStaging {
  report: AnalysisReport
  completedStages: ExportStage[]
  failedStage: ExportStage | null
  error: string | null
}

const REPORTS_KEY = 'sql-analysis-reports'
const STAGING_KEY = 'sql-analysis-report-staging'

function stageOrder(includePlan: boolean): ExportStage[] {
  return includePlan
    ? ['meta', 'sql', 'analysis', 'plan', 'commit']
    : ['meta', 'sql', 'analysis', 'commit']
}

function loadReports(): AnalysisReport[] {
  try {
    const raw = localStorage.getItem(REPORTS_KEY)
    return raw ? (JSON.parse(raw) as AnalysisReport[]) : []
  } catch {
    return []
  }
}

function loadStaging(): ExportStaging | null {
  try {
    const raw = localStorage.getItem(STAGING_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as ExportStaging
    if (!s || !s.report) return null
    // 所有阶段都已完成（在清理暂存前离开页面）说明实际已导出成功，按完成处理
    if (s.completedStages.length >= stageOrder(s.report.includePlan).length) return null
    return s
  } catch {
    return null
  }
}

export const useReportStore = defineStore('reports', () => {
  const reports = ref<AnalysisReport[]>(loadReports())
  const staging = ref<ExportStaging | null>(loadStaging())

  // 上次导出被打断（写失败或中途离开）时，标明失败位置，供再次发起
  const interrupted = computed(() => {
    const s = staging.value
    if (!s) return null
    const stages = stageOrder(s.report.includePlan)
    if (s.completedStages.length >= stages.length) return null
    const resumeStage = s.failedStage ?? stages[s.completedStages.length]
    return { name: s.report.name, stage: resumeStage, error: s.error }
  })

  function nameExists(name: string) {
    const n = name.trim()
    if (reports.value.some(r => r.name === n)) return true
    // 再核对一次落盘的清单，避免其他标签页/会话已导出同名报告
    try {
      const persisted = JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]') as AnalysisReport[]
      return persisted.some(r => r.name === n)
    } catch {
      return false
    }
  }

  function persistStaging(s: ExportStaging | null) {
    staging.value = s
    try {
      if (s) localStorage.setItem(STAGING_KEY, JSON.stringify(s))
      else localStorage.removeItem(STAGING_KEY)
    } catch {
      // 暂存本身写不进去时只能保留在内存中，尽力而为
    }
  }

  // 逐段写入：每完成一段就把进度落盘，任何一段抛错都记录失败位置
  function runStages(s: ExportStaging): boolean {
    for (const stage of stageOrder(s.report.includePlan)) {
      if (s.completedStages.includes(stage)) continue
      try {
        if (stage === 'commit') {
          const list = [...reports.value, s.report]
          localStorage.setItem(REPORTS_KEY, JSON.stringify(list))
          reports.value = list
        } else {
          localStorage.setItem(
            STAGING_KEY,
            JSON.stringify({ ...s, completedStages: [...s.completedStages, stage] } satisfies ExportStaging)
          )
        }
        s.completedStages.push(stage)
        s.failedStage = null
        s.error = null
      } catch (e) {
        s.failedStage = stage
        s.error = e instanceof Error ? e.message : String(e)
        persistStaging(s)
        return false
      }
    }
    return true
  }

  function stageError(s: ExportStaging) {
    return `导出在「${EXPORT_STAGE_LABELS[s.failedStage!]}」处失败：${s.error || '未知错误'}`
  }

  function exportReport(report: AnalysisReport): { ok: boolean; error?: string } {
    const name = report.name.trim()
    if (!name) return { ok: false, error: '请输入报告名称' }
    if (nameExists(name)) return { ok: false, error: `名称「${name}」已存在，请改名后再导出` }
    const s: ExportStaging = {
      // 深拷贝快照：导出后调用方再改动分析结果，不影响这份报告
      report: JSON.parse(JSON.stringify({ ...report, name })),
      completedStages: [],
      failedStage: null,
      error: null,
    }
    persistStaging(s)
    if (runStages(s)) {
      persistStaging(null)
      return { ok: true }
    }
    return { ok: false, error: stageError(s) }
  }

  // 从上次失败的位置继续写入
  function retryExport(): { ok: boolean; error?: string } {
    const s = staging.value
    if (!s) return { ok: false, error: '没有可重试的导出任务' }
    if (nameExists(s.report.name)) {
      return { ok: false, error: `名称「${s.report.name}」已存在，请改名后再导出` }
    }
    if (runStages(s)) {
      persistStaging(null)
      return { ok: true }
    }
    return { ok: false, error: stageError(s) }
  }

  function discardInterrupted() {
    persistStaging(null)
  }

  function removeReport(id: string) {
    reports.value = reports.value.filter(r => r.id !== id)
    try {
      localStorage.setItem(REPORTS_KEY, JSON.stringify(reports.value))
    } catch {
      // 删除后的列表写不回时，内存状态仍然生效
    }
  }

  return { reports, staging, interrupted, nameExists, exportReport, retryExport, discardInterrupted, removeReport }
})
