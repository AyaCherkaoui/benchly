'use client'

import { useEffect } from 'react'
import { speakText } from '@/lib/speak'

/**
 * Invisible client component — plays the AI greeting once per calendar day
 * (persisted in sessionStorage so navigating away and back doesn't re-trigger).
 */
export default function DashboardGreeting({ text }: { text: string }) {
  useEffect(() => {
    const key = `benchly_greeted_${new Date().toDateString()}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')

    const timer = setTimeout(() => {
      speakText(text).catch(() => {})
    }, 1000)
    return () => clearTimeout(timer)
  }, [text])

  return null
}
