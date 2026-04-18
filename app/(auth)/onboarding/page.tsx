/*
 * SQL to run in Supabase SQL Editor before using onboarding:
 *
 * alter table profiles
 *   add column if not exists lab_focus text,
 *   add column if not exists techniques text[],
 *   add column if not exists days_per_week integer,
 *   add column if not exists onboarding_complete boolean default false;
 */

'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckSquare, Square, X } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase'

const TECHNIQUES = [
  'PCR',
  'Gel Electrophoresis',
  'Western Blot',
  'Cell Culture',
  'ELISA',
  'RNA Extraction',
  'DNA Cloning',
  'Microscopy',
  'Flow Cytometry',
  'Other',
]

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-10">
      <div className="mb-2 flex justify-between text-xs text-slate-400">
        <span>Step {step} of {total}</span>
        <span>{Math.round((step / total) * 100)}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-700">
        <div
          className="h-1.5 rounded-full bg-teal-400 transition-all duration-500"
          style={{ width: `${(step / total) * 100}%` }}
        />
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Step 1
  const [labFocus, setLabFocus] = useState('')
  const [selectedTechniques, setSelectedTechniques] = useState<string[]>([])
  const [daysPerWeek, setDaysPerWeek] = useState(3)

  // Step 2 — file uploads
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function toggleTechnique(t: string) {
    setSelectedTechniques((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    )
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      ['application/pdf', 'image/jpeg', 'image/png'].includes(f.type)
    )
    setUploadedFiles((prev) => [...prev, ...files])
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setUploadedFiles((prev) => [...prev, ...files])
  }

  function removeFile(name: string) {
    setUploadedFiles((prev) => prev.filter((f) => f.name !== name))
  }

  async function handleFinish(goToTour: boolean) {
    setSaving(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      await supabase.from('profiles').update({
        lab_focus: labFocus,
        techniques: selectedTechniques,
        days_per_week: daysPerWeek,
        onboarding_complete: true,
      }).eq('id', user.id)

      if (goToTour) {
        // Navigate to protocol list — let user pick the PCR protocol to tour
        router.push('/protocol')
      } else {
        router.push('/dashboard')
      }
    } catch (e) {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d1b2a] py-12 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-[#152235] p-8 shadow-xl">
        {/* Logo */}
        <div className="mb-8 text-center">
          <span className="text-2xl font-bold text-teal-400">Benchly</span>
        </div>

        <ProgressBar step={step} total={3} />

        {/* ── Step 1 ───────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Tell us about your work</h2>
              <p className="mt-1 text-sm text-slate-400">
                This helps Benchly give you relevant guidance.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-300">
                What&apos;s your lab focused on?
              </label>
              <input
                type="text"
                value={labFocus}
                onChange={(e) => setLabFocus(e.target.value)}
                placeholder="e.g. Cancer genomics, protein folding, drug discovery…"
                className="rounded-lg bg-[#0d1b2a] px-4 py-2.5 text-white placeholder-slate-500 outline-none ring-1 ring-slate-600 focus:ring-teal-500"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-300">
                What techniques will you be working with?
              </label>
              <div className="flex flex-wrap gap-2">
                {TECHNIQUES.map((t) => {
                  const selected = selectedTechniques.includes(t)
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTechnique(t)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                        selected
                          ? 'bg-teal-500/20 text-teal-400 ring-1 ring-teal-500/50'
                          : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      {selected ? (
                        <CheckSquare size={13} />
                      ) : (
                        <Square size={13} />
                      )}
                      {t}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-300">
                How many days per week do you work in the lab?
                <span className="ml-2 text-teal-400">{daysPerWeek} day{daysPerWeek !== 1 ? 's' : ''}</span>
              </label>
              <input
                type="range"
                min={1}
                max={7}
                value={daysPerWeek}
                onChange={(e) => setDaysPerWeek(Number(e.target.value))}
                className="w-full accent-teal-400"
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>1</span><span>7</span>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full rounded-lg bg-teal-500 py-2.5 font-semibold text-white transition hover:bg-teal-400"
            >
              Continue →
            </button>
          </div>
        )}

        {/* ── Step 2 ───────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Upload your protocols</h2>
              <p className="mt-1 text-sm text-slate-400">
                Upload your protocol sheets and Benchly will read them and set up your
                step-by-step guides automatically.
              </p>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                dragging
                  ? 'border-teal-400 bg-teal-500/5'
                  : 'border-slate-600 hover:border-slate-500'
              }`}
            >
              <p className="text-sm text-slate-400">
                Drag & drop PDF, JPG, or PNG files here, or{' '}
                <span className="text-teal-400 underline">click to browse</span>
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                multiple
                className="hidden"
                onChange={handleFileInput}
              />
            </div>

            {/* File list */}
            {uploadedFiles.length > 0 && (
              <ul className="space-y-2">
                {uploadedFiles.map((f) => (
                  <li
                    key={f.name}
                    className="flex items-center justify-between rounded-lg bg-slate-800/50 px-4 py-2.5"
                  >
                    <span className="truncate text-sm text-slate-200">{f.name}</span>
                    <button
                      onClick={() => removeFile(f.name)}
                      className="ml-3 flex-shrink-0 text-slate-500 hover:text-white transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(3)}
                className="flex-1 rounded-lg bg-slate-700 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-600"
              >
                Skip for now
              </button>
              <button
                onClick={() => setStep(3)}
                className="flex-1 rounded-lg bg-teal-500 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-400"
              >
                {uploadedFiles.length > 0
                  ? `Continue with ${uploadedFiles.length} file${uploadedFiles.length !== 1 ? 's' : ''}`
                  : 'Continue →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3 ───────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">You&apos;re all set! 🎉</h2>
              <p className="mt-1 text-sm text-slate-400">Here&apos;s your plan for the week.</p>
            </div>

            <div className="rounded-xl bg-slate-800/50 p-5 space-y-3">
              {labFocus && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Lab Focus</p>
                  <p className="text-sm text-white mt-0.5">{labFocus}</p>
                </div>
              )}
              {selectedTechniques.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Techniques</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTechniques.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-teal-500/10 px-2.5 py-0.5 text-xs text-teal-400"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Lab Days</p>
                <p className="text-sm text-white mt-0.5">
                  {daysPerWeek} day{daysPerWeek !== 1 ? 's' : ''} / week
                </p>
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleFinish(true)}
                disabled={saving}
                className="w-full rounded-lg bg-teal-500 py-2.5 font-semibold text-white transition hover:bg-teal-400 disabled:opacity-50"
              >
                Start with a guided tour →
              </button>
              <button
                onClick={() => handleFinish(false)}
                disabled={saving}
                className="w-full rounded-lg bg-slate-700 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-600 disabled:opacity-50"
              >
                Go to dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
