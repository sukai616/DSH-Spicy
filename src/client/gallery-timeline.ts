import type { Job } from '../shared.js';

/** 时间轴的一天，items 已按时间倒序。 */
export interface DayGroup {
  key: string;
  label: string;
  items: Job[];
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** started_at 为 Unix 秒（可带小数），统一转毫秒。 */
export function startedMs(job: Job): number {
  const v = job.started_at ?? 0;
  return v > 1e12 ? v : v * 1000;
}

function dayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function dayLabel(ms: number, nowMs: number): string {
  const today = dayStart(nowMs);
  const target = dayStart(ms);
  const diff = Math.round((today - target) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff === 2) return '前天';
  const d = new Date(ms);
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  const label = `${md} ${WEEK[d.getDay()]}`;
  return d.getFullYear() === new Date(nowMs).getFullYear()
    ? label
    : `${d.getFullYear()}年${label}`;
}

/** 把任务按本地日期分组，日期倒序、组内时间倒序。 */
export function groupByDay(jobs: Job[], nowMs = Date.now()): DayGroup[] {
  const buckets = new Map<number, Job[]>();
  for (const job of jobs) {
    const ms = startedMs(job);
    const key = dayStart(ms);
    const list = buckets.get(key);
    if (list) list.push(job);
    else buckets.set(key, [job]);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([key, items]) => ({
      key: dayKey(key),
      label: dayLabel(key, nowMs),
      items: items.sort((a, b) => startedMs(b) - startedMs(a)),
    }));
}

/** 时间轴模式下某天是否默认展开（最近两天展开）。 */
export function expandedByDefault(group: DayGroup, index: number): boolean {
  return index < 2;
}
