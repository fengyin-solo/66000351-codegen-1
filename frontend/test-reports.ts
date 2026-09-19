import { setActivePinia, createPinia } from 'pinia'
import { useReportStore } from './src/store/reports'
import type { AnalysisReport } from './src/store/reports'

// localStorage 内存模拟（必须在创建 store 前装好）
const mem = new Map<string, string>()
const ls = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)) },
  removeItem: (k: string) => { mem.delete(k) },
}
;(globalThis as any).localStorage = ls

setActivePinia(createPinia())
const rs = useReportStore()

function makeReport(name: string): AnalysisReport {
  return {
    id: 'id-' + name, name, createdAt: 1, sql: 'SELECT 1', queryType: 'SELECT',
    complexity: 3, complexityLabel: '中等', tables: ['users'], suggestions: ['s1'],
    includePlan: true, plan: { operation: 'Sort', cost: 1, rows: 1, children: [] },
  }
}

let failures = 0
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓', msg)
  else { console.error('  ✗', msg); failures++ }
}

console.log('1. 正常导出')
const r1 = rs.exportReport(makeReport('报告A'))
assert(r1.ok, '导出成功')
assert(rs.reports.length === 1 && rs.reports[0].name === '报告A', '报告进入历史清单')
assert(mem.has('sql-analysis-reports'), '已持久化到 localStorage')
assert(rs.interrupted === null, '无中断状态')

console.log('2. 重名拒绝')
const dup = rs.exportReport(makeReport('报告A'))
assert(!dup.ok && /已存在.*改名/.test(dup.error!), `提示改名后再导出: ${dup.error}`)
assert(rs.reports.length === 1, '重名未新增报告')

console.log('3. 写入被打断（模拟 analysis 阶段写失败）')
let failArmed = true
ls.setItem = (k: string, v: string) => {
  if (failArmed && k === 'sql-analysis-report-staging' && v.includes('"analysis"')) {
    throw new Error('模拟写入中断')
  }
  mem.set(k, String(v))
}
const r2 = rs.exportReport(makeReport('报告B'))
assert(!r2.ok, '导出返回失败')
assert(!!rs.interrupted && rs.interrupted.name === '报告B', '标明上次失败的任务')
assert(rs.interrupted!.stage === 'analysis', `标明失败位置为 analysis 阶段（实际: ${rs.interrupted!.stage}）`)
assert(!!rs.interrupted!.error, '记录了失败原因')
assert(rs.reports.length === 1, '中断的报告未进入历史清单')

console.log('4. 从失败位置再次发起')
failArmed = false
const r3 = rs.retryExport()
assert(r3.ok, '重试成功')
assert(rs.reports.length === 2 && rs.reports.some(r => r.name === '报告B'), '重试后报告进入清单')
assert(rs.interrupted === null, '中断状态已清除')

console.log('5. 删除')
rs.removeReport(rs.reports.find(r => r.name === '报告A')!.id)
assert(rs.reports.length === 1 && rs.reports[0].name === '报告B', '删除生效')

console.log('6. 快照独立性')
const src = makeReport('报告C')
rs.exportReport(src)
src.suggestions.push('后期篡改')
src.tables.push('orders')
src.plan!.operation = 'HACKED'
const saved = rs.reports.find(r => r.name === '报告C')!
assert(saved.suggestions.length === 1 && saved.tables.length === 1 && saved.plan!.operation === 'Sort', '导出后修改源对象不影响已保存报告')

console.log('7. 刷新后留存（新 pinia + 同一 localStorage）')
setActivePinia(createPinia())
const rs2 = useReportStore()
assert(rs2.reports.length === 2, '历史报告仍在')
assert(rs2.interrupted === null, '无残留中断状态')

console.log('8. 重试时名称已被占用（另一会话已导出同名报告）')
mem.clear()
ls.setItem = (k: string, v: string) => { mem.set(k, String(v)) }
setActivePinia(createPinia())
const rs3 = useReportStore()
let throwsLeft = 1
ls.setItem = (k: string, v: string) => {
  // sql 阶段检查点的特征是 completedStages 推进到 ["meta","sql"]
  if (throwsLeft > 0 && k === 'sql-analysis-report-staging' && v.includes('["meta","sql"')) {
    throwsLeft--
    throw new Error('中断')
  }
  mem.set(k, String(v))
}
rs3.exportReport(makeReport('撞名')) // 在 sql 阶段被打断，暂存已落盘
assert(!!rs3.interrupted, '会话A：导出被打断')
// 另一会话（新 store 实例）成功导出了同名报告
setActivePinia(createPinia())
const rs4 = useReportStore()
rs4.exportReport(makeReport('撞名'))
assert(rs4.reports.length === 1, '会话B：同名报告导出成功')
// 回到会话A 重试，应被重名检查拦截
const retry = rs3.retryExport()
assert(!retry.ok && /已存在.*改名/.test(retry.error!), `重试时重名被拦截: ${retry.error}`)

console.log(failures ? `\n${failures} 个断言失败` : '\n全部通过')
process.exit(failures ? 1 : 0)
