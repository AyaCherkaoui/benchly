'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function DashboardSeedButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSeed() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/seed-demo', { method: 'POST' })
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error ?? 'Seed failed') }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load demo data.')
    } finally { setLoading(false) }
  }

  return (
    <div className="rounded-xl p-5" style={{ background: 'rgba(232,165,152,0.04)', border: '1px solid rgba(232,165,152,0.15)' }}>
      <p className="mb-1 text-sm" style={{ color: 'var(--text-primary)' }}>New here?</p>
      <p className="mb-4 text-xs" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
        Load realistic demo data — a PCR protocol, samples, and voice logs.
      </p>
      <button
        onClick={handleSeed}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs transition-opacity hover:opacity-80 disabled:opacity-30"
        style={{ border: '1px solid var(--accent)', color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : null}
        {loading ? 'Loading…' : 'Load Demo Data'}
      </button>
      {error && <p className="mt-2 text-xs" style={{ color: '#f87171' }}>{error}</p>}
    </div>
  )
}
