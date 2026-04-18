'use client'

import { useEffect } from 'react'

/**
 * Invisible component mounted on the dashboard.
 * On first load of a new day, triggers yesterday's daily summary generation
 * if it doesn't already exist.
 */
export default function DailySummaryTrigger({ yesterday }: { yesterday: string }) {
  useEffect(() => {
    const key = `daily_summary_triggered_${yesterday}`
    if (sessionStorage.getItem(key)) return

    sessionStorage.setItem(key, '1')

    fetch('/api/daily-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: yesterday }),
    }).catch(() => {})
  }, [yesterday])

  return null
}
