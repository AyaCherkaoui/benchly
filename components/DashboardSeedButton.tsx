'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'

export default function DashboardSeedButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSeed() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/seed-demo', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Seed failed')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load demo data.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl bg-teal-500/5 p-6 ring-1 ring-teal-500/20">
      <h2 className="mb-1 text-lg font-semibold text-white">New here?</h2>
      <p className="mb-4 text-sm text-slate-400">
        Load realistic demo data to see how Benchly works — a PCR protocol, samples, and
        voice logs are pre-populated so you can explore all features immediately.
      </p>
      <button
        onClick={handleSeed}
        disabled={loading}
        className="flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-2.5 font-semibold text-white transition hover:bg-teal-400 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Sparkles size={16} />
        )}
        {loading ? 'Loading demo data…' : 'Load Demo Data'}
      </button>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  )
}
