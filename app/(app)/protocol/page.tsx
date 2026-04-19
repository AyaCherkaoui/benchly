/*
-- alter table sessions add column if not exists experiment_number text;
-- alter table sessions add column if not exists project_name text;
*/
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, X, Clock } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import { Protocol, Session } from '@/types'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface SessionWithProtocol extends Session {
  protocols: { name: string } | null
  experiment_number?: string | null
  project_name?: string | null
}

export default function ProtocolsPage() {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  const [protocols, setProtocols] = useState<Protocol[]>([])
  const [pastSessions, setPastSessions] = useState<SessionWithProtocol[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null)
  const [expNumber, setExpNumber] = useState('')
  const [projectName, setProjectName] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [starting, setStarting] = useState(false)

  const inputStyle = {
    width: '100%',
    background: '#0a0a0a',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  useEffect(() => {
    async function load() {
      const [{ data: prots }, { data: sessions }] = await Promise.all([
        supabase.from('protocols').select('*').order('created_at'),
        supabase.from('sessions').select('*, protocols(name)').order('last_updated', { ascending: false }).limit(10),
      ])
      setProtocols(prots ?? [])
      setPastSessions((sessions ?? []) as SessionWithProtocol[])
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openModal(protocol: Protocol) {
    setSelectedProtocol(protocol)
    // Auto-suggest experiment number based on past sessions for this protocol
    const pastForProtocol = pastSessions.filter((s) => s.protocol_id === protocol.id && s.experiment_number)
    const lastNum = pastForProtocol[0]?.experiment_number
    if (lastNum) {
      const match = lastNum.match(/(\d+)$/)
      if (match) {
        const nextNum = String(parseInt(match[1]) + 1).padStart(match[1].length, '0')
        setExpNumber(lastNum.replace(/\d+$/, nextNum))
      } else {
        setExpNumber(lastNum + '-2')
      }
    } else {
      const prefix = protocol.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 3)
      setExpNumber(`${prefix}-001`)
    }
    // Auto-suggest project name from most recent session
    const lastProject = pastSessions.find((s) => s.project_name)?.project_name ?? ''
    setProjectName(lastProject)
    setStartDate(new Date().toISOString().split('T')[0])
    setShowModal(true)
  }

  async function handleStart() {
    if (!selectedProtocol) return
    setStarting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: newSession } = await supabase.from('sessions').insert({
        user_id: user.id,
        protocol_id: selectedProtocol.id,
        current_step: 1,
        completed_steps: [],
        started_at: new Date(startDate).toISOString(),
        last_updated: new Date().toISOString(),
        experiment_number: expNumber.trim() || null,
        project_name: projectName.trim() || null,
      }).select('id').single()
      router.push(`/protocol/${selectedProtocol.id}${newSession?.id ? `?sid=${newSession.id}` : ''}`)
    } catch {
      router.push(`/protocol/${selectedProtocol.id}`)
    }
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center"><p style={{ color: 'var(--text-muted)' }}>Loading…</p></div>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <h1 className="font-serif text-4xl font-normal" style={{ color: 'var(--text-primary)' }}>Protocols</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>Select a protocol to begin your lab session</p>
      </div>

      {/* Protocol grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        {protocols.map((protocol) => (
          <button
            key={protocol.id}
            onClick={() => openModal(protocol)}
            className="group flex items-start justify-between gap-4 rounded-xl p-6 transition-colors text-left w-full"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(232,165,152,0.3)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div className="min-w-0">
              <h2 className="font-serif text-xl font-normal" style={{ color: 'var(--text-primary)' }}>
                {protocol.name}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {protocol.description}
              </p>
            </div>
            <ArrowRight size={16} className="mt-1 flex-shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--accent)' }} />
          </button>
        ))}
      </div>

      {/* Past Experiments */}
      <div>
        <h2 className="mb-4 font-serif text-2xl font-normal" style={{ color: 'var(--text-primary)' }}>Past Experiments</h2>
        {pastSessions.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No past experiments yet. Start your first one above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pastSessions.map((session) => {
              const totalStepsDone = session.completed_steps?.length ?? 0
              const isComplete = session.experiment_number && totalStepsDone > 0
              return (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-xl px-5 py-3.5"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {session.experiment_number && (
                      <span className="font-mono text-xs flex-shrink-0" style={{ color: 'var(--accent)' }}>
                        {session.experiment_number}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        {(session.protocols as unknown as { name: string } | null)?.name ?? 'Unknown'}
                      </p>
                      {session.project_name && (
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{session.project_name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-16" style={{ background: 'var(--border)', borderRadius: 2 }}>
                        <div className="h-1" style={{ width: `${Math.min(100, totalStepsDone * 10)}%`, background: 'var(--accent)', borderRadius: 2 }} />
                      </div>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{totalStepsDone} steps</span>
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      <Clock size={10} style={{ display: 'inline', marginRight: 3 }} />
                      {timeAgo(session.last_updated)}
                    </span>
                    <button
                      onClick={() => router.push(`/protocol/${session.protocol_id}`)}
                      className="rounded-lg px-3 py-1 text-xs transition-opacity hover:opacity-80"
                      style={isComplete
                        ? { border: '1px solid var(--border)', color: 'var(--text-muted)' }
                        : { background: 'var(--accent)', color: '#0a0a0a' }
                      }
                    >
                      {isComplete ? 'Review →' : 'Continue →'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Start New Experiment Modal */}
      {showModal && selectedProtocol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-xl p-6" style={{ background: '#111111', border: '1px solid var(--border)' }}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-serif text-xl font-normal" style={{ color: 'var(--text-primary)' }}>Start New Experiment</h2>
              <button onClick={() => setShowModal(false)} className="transition-opacity hover:opacity-60" style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
            </div>

            <p className="mb-5 text-sm" style={{ color: 'var(--text-muted)' }}>{selectedProtocol.name}</p>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Experiment Number</label>
                <input type="text" value={expNumber} onChange={(e) => setExpNumber(e.target.value)} placeholder="e.g. PCR-001" style={inputStyle} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Project Name</label>
                <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. CRISPR Knockout Study" style={inputStyle} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => router.push(`/protocol/${selectedProtocol.id}`)}
                className="text-xs transition-opacity hover:opacity-70"
                style={{ color: 'var(--text-muted)' }}
              >
                Skip
              </button>
              <div className="flex gap-3">
                <button onClick={() => setShowModal(false)} className="rounded-lg px-4 py-2 text-xs transition-opacity hover:opacity-70" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Cancel
                </button>
                <button
                  onClick={handleStart}
                  disabled={starting}
                  className="rounded-lg px-5 py-2 text-xs transition-opacity hover:opacity-80 disabled:opacity-30"
                  style={{ background: 'var(--accent)', color: '#0a0a0a', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                >
                  {starting ? 'Starting…' : 'Start Experiment →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
