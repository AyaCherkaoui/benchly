/*
-- alter table samples add column if not exists project_name text;
-- alter table samples add column if not exists experiment_number text;
*/
'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import { Protocol, Sample } from '@/types'

const LOCATIONS = ['-20°C Freezer', '-80°C Freezer', '4°C Fridge', 'Room Temperature', 'Incubator', 'PCR Machine', 'Other']
const EMPTY_FORM = { sample_id_label: '', tube_label: '', protocol_id: '', location: LOCATIONS[0], notes: '', project_name: '', experiment_number: '' }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const inputStyle = {
  background: '#0a0a0a',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 13,
  width: '100%',
  outline: 'none',
}

export default function SamplesPage() {
  const supabase = createSupabaseBrowserClient()
  const [samples, setSamples] = useState<Sample[]>([])
  const [protocols, setProtocols] = useState<Protocol[]>([])
  const [filterProtocolId, setFilterProtocolId] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: samplesData }, { data: protocolsData }] = await Promise.all([
      supabase.from('samples').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('protocols').select('*').order('created_at'),
    ])
    setSamples(samplesData ?? [])
    setProtocols(protocolsData ?? [])
    setLoading(false)
  }

  function protocolName(id?: string | null) {
    if (!id) return '—'
    return protocols.find((p) => p.id === id)?.name ?? '—'
  }

  const filtered = filterProtocolId === 'all' ? samples : samples.filter((s) => s.protocol_id === filterProtocolId)

  function openModal() { setForm({ ...EMPTY_FORM, protocol_id: protocols[0]?.id ?? '' }); setShowModal(true) }
  function closeModal() { setShowModal(false); setForm({ ...EMPTY_FORM }) }

  async function handleSave() {
    if (!form.sample_id_label.trim() || !form.tube_label.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const { data, error } = await supabase.from('samples').insert({
      user_id: user.id,
      sample_id_label: form.sample_id_label.trim(),
      tube_label: form.tube_label.trim(),
      protocol_id: form.protocol_id || null,
      location: form.location,
      notes: form.notes.trim() || null,
      project_name: form.project_name.trim() || null,
      experiment_number: form.experiment_number.trim() || null,
    }).select().single()
    if (!error && data) { setSamples((prev) => [data, ...prev]); toast.success('Sample logged') }
    else if (error) toast.error('Failed to save sample')
    setSaving(false); closeModal()
  }

  async function handleDelete(id: string) {
    setSamples((prev) => prev.filter((s) => s.id !== id))
    await supabase.from('samples').delete().eq('id', id)
    toast('Sample removed')
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center"><p style={{ color: 'var(--text-muted)' }}>Loading…</p></div>
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-4xl font-normal" style={{ color: 'var(--text-primary)' }}>Samples</h1>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>Track all samples across experiments</p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs transition-opacity hover:opacity-80"
          style={{ border: '1px solid var(--accent)', color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}
        >
          <Plus size={13} /> Add Sample
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Filter:</span>
        <select
          value={filterProtocolId}
          onChange={(e) => setFilterProtocolId(e.target.value)}
          className="rounded-lg px-3 py-1.5 text-sm outline-none"
          style={{ background: '#111111', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
        >
          <option value="all">All Experiments</option>
          {protocols.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl py-24 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="font-serif text-2xl font-normal" style={{ color: 'var(--text-muted)' }}>No samples yet</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
            {filterProtocolId === 'all' ? 'Start tracking by adding your first sample' : 'No samples for this experiment'}
          </p>
          {filterProtocolId === 'all' && (
            <button onClick={openModal} className="mt-2 flex items-center gap-2 rounded-lg px-4 py-2 text-xs transition-opacity hover:opacity-80"
              style={{ border: '1px solid var(--accent)', color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              <Plus size={13} /> Add Sample
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-xl" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Sample ID', 'Tube', 'Project', 'Exp #', 'Experiment', 'Location', 'Notes', 'Added', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 500 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((sample, i) => (
                  <tr
                    key={sample.id}
                    className="transition-colors"
                    style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--accent)' }}>{sample.sample_id_label}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>{sample.tube_label}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{sample.project_name ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{sample.experiment_number ?? '—'}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{protocolName(sample.protocol_id)}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{sample.location}</td>
                    <td className="max-w-[120px] px-4 py-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <span className="line-clamp-1">{sample.notes ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(sample.created_at)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(sample.id)} className="rounded-lg p-1.5 transition-opacity hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden space-y-2">
            {filtered.map((sample) => (
              <div key={sample.id} className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="flex items-start justify-between">
                  <span className="font-mono text-sm" style={{ color: 'var(--accent)' }}>{sample.sample_id_label}</span>
                  <button onClick={() => handleDelete(sample.id)} className="transition-opacity hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-primary)' }}>{sample.tube_label}</p>
                {sample.project_name && <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>Project: {sample.project_name}</p>}
                {sample.experiment_number && <p className="mt-0.5 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{sample.experiment_number}</p>}
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>{protocolName(sample.protocol_id)} · {sample.location}</p>
                {sample.notes && <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{sample.notes}</p>}
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>{formatDate(sample.created_at)}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md rounded-xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: '#111111', border: '1px solid var(--border)' }}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-serif text-xl font-normal" style={{ color: 'var(--text-primary)' }}>Add Sample</h2>
              <button onClick={closeModal} className="transition-opacity hover:opacity-60" style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
            </div>

            <div className="flex flex-col gap-4">
              {[
                { label: 'Sample ID', key: 'sample_id_label', placeholder: 'e.g. PCR-001' },
                { label: 'Tube Label', key: 'tube_label', placeholder: 'e.g. Sample A — Control' },
                { label: 'Project Name', key: 'project_name', placeholder: 'e.g. CRISPR Knockout Study' },
                { label: 'Experiment #', key: 'experiment_number', placeholder: 'e.g. PCR-003' },
              ].map(({ label, key, placeholder }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</label>
                  <input
                    type="text"
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    style={inputStyle}
                  />
                </div>
              ))}

              <div className="flex flex-col gap-1.5">
                <label style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Experiment</label>
                <select value={form.protocol_id} onChange={(e) => setForm((f) => ({ ...f, protocol_id: e.target.value }))} style={inputStyle}>
                  <option value="">— None —</option>
                  {protocols.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Location</label>
                <select value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} style={inputStyle}>
                  {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes…"
                  rows={3}
                  style={{ ...inputStyle, resize: 'none' }}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={closeModal} className="rounded-lg px-4 py-2 text-xs transition-opacity hover:opacity-70"
                style={{ color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !form.sample_id_label.trim() || !form.tube_label.trim()}
                className="rounded-lg px-5 py-2 text-xs transition-opacity hover:opacity-80 disabled:opacity-30"
                style={{ background: 'var(--accent)', color: '#0a0a0a', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {saving ? 'Saving…' : 'Save Sample'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
