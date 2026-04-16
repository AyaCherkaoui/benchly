'use client'

import { useEffect, useState } from 'react'
import { Beaker, Plus, Trash2, X } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import { Protocol, Sample } from '@/types'

const LOCATIONS = [
  '-20°C Freezer',
  '-80°C Freezer',
  '4°C Fridge',
  'Room Temperature',
  'Incubator',
  'PCR Machine',
  'Other',
]

const EMPTY_FORM = {
  sample_id_label: '',
  tube_label: '',
  protocol_id: '',
  location: LOCATIONS[0],
  notes: '',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
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

  useEffect(() => {
    loadData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: samplesData }, { data: protocolsData }] = await Promise.all([
      supabase
        .from('samples')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
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

  const filtered =
    filterProtocolId === 'all'
      ? samples
      : samples.filter((s) => s.protocol_id === filterProtocolId)

  function openModal() {
    setForm({ ...EMPTY_FORM, protocol_id: protocols[0]?.id ?? '' })
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setForm({ ...EMPTY_FORM })
  }

  async function handleSave() {
    if (!form.sample_id_label.trim() || !form.tube_label.trim()) return
    setSaving(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const { data, error } = await supabase
      .from('samples')
      .insert({
        user_id: user.id,
        sample_id_label: form.sample_id_label.trim(),
        tube_label: form.tube_label.trim(),
        protocol_id: form.protocol_id || null,
        location: form.location,
        notes: form.notes.trim() || null,
      })
      .select()
      .single()

    if (!error && data) {
      setSamples((prev) => [data, ...prev])
    }

    setSaving(false)
    closeModal()
  }

  async function handleDelete(id: string) {
    setSamples((prev) => prev.filter((s) => s.id !== id))
    await supabase.from('samples').delete().eq('id', id)
  }

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-slate-400">Loading samples…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Sample Tracker</h1>
          <p className="mt-1 text-sm text-slate-400">
            Track all your samples across experiments
          </p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-400"
        >
          <Plus size={16} />
          Add Sample
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-400">Filter by experiment:</label>
        <select
          value={filterProtocolId}
          onChange={(e) => setFilterProtocolId(e.target.value)}
          className="rounded-lg bg-[#152235] px-3 py-2 text-sm text-white outline-none ring-1 ring-slate-700 focus:ring-teal-500"
        >
          <option value="all">All Experiments</option>
          {protocols.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-[#152235] py-20 text-center">
          <Beaker size={40} className="text-slate-600" />
          <div>
            <p className="font-semibold text-white">No samples yet</p>
            <p className="mt-1 text-sm text-slate-400">
              {filterProtocolId === 'all'
                ? 'Start tracking by adding your first sample'
                : 'No samples for this experiment'}
            </p>
          </div>
          {filterProtocolId === 'all' && (
            <button
              onClick={openModal}
              className="flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-400"
            >
              <Plus size={16} />
              Add your first sample
            </button>
          )}
        </div>
      ) : (
        /* Table */
        <div className="overflow-hidden rounded-2xl bg-[#152235] ring-1 ring-slate-700/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3">Sample ID</th>
                <th className="px-5 py-3">Tube Label</th>
                <th className="px-5 py-3">Experiment</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Notes</th>
                <th className="px-5 py-3">Date Added</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {filtered.map((sample) => (
                <tr
                  key={sample.id}
                  className="transition hover:bg-slate-700/20"
                >
                  <td className="px-5 py-3 font-mono text-teal-400">
                    {sample.sample_id_label}
                  </td>
                  <td className="px-5 py-3 text-white">{sample.tube_label}</td>
                  <td className="px-5 py-3 text-slate-300">
                    {protocolName(sample.protocol_id)}
                  </td>
                  <td className="px-5 py-3 text-slate-300">{sample.location}</td>
                  <td className="max-w-[180px] px-5 py-3 text-slate-400">
                    <span className="line-clamp-1">{sample.notes ?? '—'}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-400">
                    {formatDate(sample.created_at)}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => handleDelete(sample.id)}
                      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                      title="Delete sample"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Sample modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-[#152235] p-6 shadow-2xl ring-1 ring-slate-700">
            {/* Modal header */}
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Add Sample</h2>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Sample ID */}
              <div className="flex flex-col gap-1">
                <label className="text-sm text-slate-300">Sample ID</label>
                <input
                  type="text"
                  value={form.sample_id_label}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sample_id_label: e.target.value }))
                  }
                  placeholder="e.g. PCR-001"
                  className="rounded-lg bg-[#0d1b2a] px-4 py-2.5 text-white placeholder-slate-500 outline-none ring-1 ring-slate-600 focus:ring-teal-500"
                />
              </div>

              {/* Tube Label */}
              <div className="flex flex-col gap-1">
                <label className="text-sm text-slate-300">Tube Label</label>
                <input
                  type="text"
                  value={form.tube_label}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, tube_label: e.target.value }))
                  }
                  placeholder="e.g. Sample A — Control"
                  className="rounded-lg bg-[#0d1b2a] px-4 py-2.5 text-white placeholder-slate-500 outline-none ring-1 ring-slate-600 focus:ring-teal-500"
                />
              </div>

              {/* Experiment */}
              <div className="flex flex-col gap-1">
                <label className="text-sm text-slate-300">Experiment</label>
                <select
                  value={form.protocol_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, protocol_id: e.target.value }))
                  }
                  className="rounded-lg bg-[#0d1b2a] px-4 py-2.5 text-white outline-none ring-1 ring-slate-600 focus:ring-teal-500"
                >
                  <option value="">— None —</option>
                  {protocols.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Location */}
              <div className="flex flex-col gap-1">
                <label className="text-sm text-slate-300">Location</label>
                <select
                  value={form.location}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, location: e.target.value }))
                  }
                  className="rounded-lg bg-[#0d1b2a] px-4 py-2.5 text-white outline-none ring-1 ring-slate-600 focus:ring-teal-500"
                >
                  {LOCATIONS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div className="flex flex-col gap-1">
                <label className="text-sm text-slate-300">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="Optional notes about this sample…"
                  rows={3}
                  className="resize-none rounded-lg bg-[#0d1b2a] px-4 py-2.5 text-white placeholder-slate-500 outline-none ring-1 ring-slate-600 focus:ring-teal-500"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-400 transition hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={
                  saving ||
                  !form.sample_id_label.trim() ||
                  !form.tube_label.trim()
                }
                className="rounded-xl bg-teal-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-teal-400 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Sample'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
