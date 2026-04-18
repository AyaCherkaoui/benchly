'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, FlaskConical, Beaker, GraduationCap, BookOpen, Microscope, BarChart2, UserCheck } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase'

const ROLE_CARDS = [
  { value: 'intern', label: 'Intern', Icon: FlaskConical },
  { value: 'lab_assistant', label: 'Lab Assistant', Icon: Beaker },
  { value: 'phd', label: 'PhD Student', Icon: GraduationCap },
  { value: 'masters', label: 'Masters', Icon: BookOpen },
  { value: 'postdoc', label: 'Postdoc', Icon: Microscope },
  { value: 'pi', label: 'PI', Icon: BarChart2 },
  { value: 'research_associate', label: 'Res. Associate', Icon: UserCheck },
]

const TECHNIQUES = [
  'PCR', 'Gel Electrophoresis', 'Western Blot', 'Cell Culture', 'ELISA',
  'RNA Extraction', 'DNA Cloning', 'Microscopy', 'Flow Cytometry',
  'Protein Purification', 'CRISPR', 'Sequencing', 'Other',
]

const inputStyle: React.CSSProperties = {
  background: '#0a0a0a',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#f0f0f0',
  borderRadius: 8,
  padding: '11px 14px',
  fontSize: 14,
  width: '100%',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#555555',
  display: 'block',
  marginBottom: 6,
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-10">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className="h-1.5 rounded-full transition-all duration-300"
          style={{ width: i < current ? 24 : 6, background: i < current ? '#e8a598' : 'rgba(255,255,255,0.15)' }}
        />
      ))}
    </div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  // Step 1
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('intern')
  const [labName, setLabName] = useState('')
  const [supervisorName, setSupervisorName] = useState('')

  // Step 2
  const [labFocus, setLabFocus] = useState('')
  const [techniques, setTechniques] = useState<string[]>([])
  const [daysPerWeek, setDaysPerWeek] = useState(3)

  // Step 3
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [pastedText, setPastedText] = useState('')

  // Step 5 (PI/Postdoc)
  const [teamEmails, setTeamEmails] = useState('')
  const [inviting, setInviting] = useState(false)

  const isPIOrPostdoc = role === 'pi' || role === 'postdoc'
  const totalSteps = isPIOrPostdoc ? 5 : 4
  const displayName = fullName.trim().split(' ')[0] || 'there'

  function toggleTechnique(t: string) {
    setTechniques((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(f.type)
    )
    setUploadedFiles((prev) => [...prev, ...files])
  }

  async function handleFinish() {
    setSaving(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      await supabase.from('profiles').upsert({
        id: user.id,
        full_name: fullName.trim() || null,
        role,
        lab_name: labName.trim() || null,
        supervisor_name: supervisorName.trim() || null,
        lab_focus: labFocus.trim() || null,
        techniques,
        days_per_week: daysPerWeek,
        onboarding_complete: true,
      }, { onConflict: 'id' })

      if (isPIOrPostdoc) {
        setStep(5)
        setSaving(false)
      } else {
        router.push('/dashboard')
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  async function handleInviteTeam() {
    const emails = teamEmails.split('\n').map((e) => e.trim()).filter(Boolean)
    if (!emails.length) { router.push('/dashboard'); return }
    setInviting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/dashboard'); return }
      await Promise.all(emails.map(async (memberEmail) => {
        try {
          await supabase.from('lab_relationships').insert({
            supervisor_id: user.id,
            supervisor_email: user.email,
            member_email: memberEmail,
            status: 'pending',
          })
        } catch { /* silent */ }
      }))
    } catch { /* silent */ }
    router.push('/dashboard')
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4 py-12"
      style={{ background: '#0a0a0a' }}
    >
      <div className="w-full max-w-lg">
        <p className="mb-12 text-center font-serif text-xl font-normal" style={{ color: '#f0f0f0' }}>
          Benchly
        </p>

        <ProgressDots current={step} total={totalSteps} />

        {/* ── Step 1 ─────────────────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-8">
            <div>
              <h1 className="font-serif text-4xl font-normal" style={{ color: '#f0f0f0' }}>Welcome to Benchly.</h1>
              <p className="mt-3 text-sm" style={{ color: '#888888' }}>Let&apos;s set up your workspace.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label style={labelStyle}>Full Name</label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Your Role</label>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {ROLE_CARDS.map(({ value, label, Icon }) => {
                    const selected = role === value
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRole(value)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          gap: 6, padding: '12px 6px',
                          background: selected ? 'rgba(232,165,152,0.08)' : '#111111',
                          border: `1px solid ${selected ? '#e8a598' : 'rgba(255,255,255,0.08)'}`,
                          borderRadius: 10, cursor: 'pointer',
                          transform: selected ? 'scale(1.04)' : 'scale(1)',
                          transition: 'all 150ms ease',
                        }}
                      >
                        <Icon size={16} color={selected ? '#e8a598' : '#555555'} />
                        <span style={{ fontSize: 10, color: selected ? '#e8a598' : '#555555', letterSpacing: '0.03em', textAlign: 'center' }}>{label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Institution / Lab Name</label>
                <input type="text" value={labName} onChange={(e) => setLabName(e.target.value)} placeholder="Smith Lab, MIT Biology" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Supervisor <span style={{ color: '#444' }}>(optional)</span></label>
                <input type="text" value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} placeholder="Dr. Jane Smith or email" style={inputStyle} />
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full rounded-lg py-3 text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: '#e8a598', color: '#0a0a0a', letterSpacing: '0.1em', textTransform: 'uppercase' }}
            >
              Continue →
            </button>
          </div>
        )}

        {/* ── Step 2 ─────────────────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-8">
            <div>
              <h1 className="font-serif text-4xl font-normal" style={{ color: '#f0f0f0' }}>What are you working on?</h1>
            </div>

            <div className="space-y-5">
              <div>
                <label style={labelStyle}>Describe your project</label>
                <textarea
                  value={labFocus}
                  onChange={(e) => setLabFocus(e.target.value)}
                  placeholder="e.g. I'm studying the effect of CRISPR knockouts on gene expression in cancer cell lines."
                  rows={3}
                  style={{ ...inputStyle, resize: 'none' }}
                />
              </div>

              <div>
                <label style={labelStyle}>Techniques</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {TECHNIQUES.map((t) => {
                    const selected = techniques.includes(t)
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTechnique(t)}
                        className="rounded-full text-xs transition-all duration-150"
                        style={{
                          height: 36, padding: '0 12px',
                          background: selected ? 'rgba(232,165,152,0.15)' : 'transparent',
                          border: `1px solid ${selected ? '#e8a598' : 'rgba(255,255,255,0.08)'}`,
                          color: selected ? '#e8a598' : '#888888',
                        }}
                      >
                        {t}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Days per week in the lab</label>
                <div className="mt-2 flex gap-2">
                  {[1, 2, 3, 4, 5].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDaysPerWeek(d)}
                      className="h-10 w-10 rounded-full text-sm transition-all duration-150"
                      style={daysPerWeek === d
                        ? { background: '#e8a598', color: '#0a0a0a', fontWeight: 500 }
                        : { border: '1px solid rgba(255,255,255,0.08)', color: '#888888' }
                      }
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="rounded-lg px-5 py-3 text-xs transition-opacity hover:opacity-70" style={{ border: '1px solid rgba(255,255,255,0.08)', color: '#888888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                ← Back
              </button>
              <button onClick={() => setStep(3)} className="flex-1 rounded-lg py-3 text-xs font-medium transition-opacity hover:opacity-80" style={{ background: '#e8a598', color: '#0a0a0a', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3 ─────────────────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-8">
            <div>
              <h1 className="font-serif text-4xl font-normal" style={{ color: '#f0f0f0' }}>Got any protocol sheets?</h1>
              <p className="mt-3 text-sm" style={{ color: '#888888' }}>Upload them and Benchly will guide you through every step.</p>
            </div>

            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-xl text-center transition-colors flex flex-col items-center justify-center"
                style={{
                  height: 200,
                  border: `1.5px dashed ${dragging ? '#e8a598' : 'rgba(232,165,152,0.3)'}`,
                  background: dragging ? 'rgba(232,165,152,0.04)' : 'transparent',
                }}
              >
                <p className="text-sm" style={{ color: '#555555' }}>Drop PDF, JPG, PNG or DOCX here</p>
                <p className="mt-1 text-xs" style={{ color: '#444444' }}>or <span style={{ color: '#e8a598' }}>click to browse</span></p>
                <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" multiple className="hidden" onChange={(e) => setUploadedFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])} />
              </div>

              {uploadedFiles.length > 0 && (
                <ul className="space-y-2">
                  {uploadedFiles.map((f) => (
                    <li key={f.name} className="flex items-center justify-between rounded-lg px-4 py-2.5" style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <span className="truncate text-sm" style={{ color: '#f0f0f0' }}>{f.name}</span>
                      <button onClick={() => setUploadedFiles((prev) => prev.filter((x) => x.name !== f.name))} className="ml-3 flex-shrink-0 transition-opacity hover:opacity-60" style={{ color: '#555555' }}>
                        <X size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div>
                <label style={labelStyle}>Or paste protocol text</label>
                <textarea value={pastedText} onChange={(e) => setPastedText(e.target.value)} placeholder="Paste steps, notes, or instructions here…" rows={4} style={{ ...inputStyle, resize: 'none' }} />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="rounded-lg px-5 py-3 text-xs transition-opacity hover:opacity-70" style={{ border: '1px solid rgba(255,255,255,0.08)', color: '#888888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                ← Back
              </button>
              <button onClick={() => setStep(4)} className="flex-1 rounded-lg py-3 text-xs font-medium transition-opacity hover:opacity-80" style={{ background: '#e8a598', color: '#0a0a0a', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {uploadedFiles.length > 0 ? `Continue with ${uploadedFiles.length} file${uploadedFiles.length !== 1 ? 's' : ''}` : 'Continue →'}
              </button>
            </div>
            <button onClick={() => setStep(4)} className="w-full text-xs transition-opacity hover:opacity-60" style={{ color: '#555555', letterSpacing: '0.06em' }}>
              Skip for now →
            </button>
          </div>
        )}

        {/* ── Step 4 — Confirm ───────────────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-8">
            <div>
              <h1 className="font-serif text-4xl font-normal" style={{ color: '#f0f0f0' }}>
                You&apos;re all set,{' '}
                <span style={{ fontStyle: 'italic' }}>{displayName}.</span>
              </h1>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: '#888888' }}>
                I&apos;ll guide you through every experiment step by step. Ask me anything, anytime — just say{' '}
                <span style={{ color: '#e8a598' }}>&ldquo;Hey Benchly&rdquo;</span>.
              </p>
            </div>

            {techniques.length > 0 && (
              <div>
                <p style={{ ...labelStyle, marginBottom: 10 }}>Your techniques</p>
                <div className="flex flex-wrap gap-2">
                  {techniques.map((t) => (
                    <span key={t} className="rounded-full px-3 py-1 text-xs" style={{ background: 'rgba(232,165,152,0.12)', border: '1px solid rgba(232,165,152,0.3)', color: '#e8a598' }}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl p-5 space-y-3" style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: '#555555' }}>Name</span>
                <span style={{ color: '#f0f0f0' }}>{displayName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: '#555555' }}>Role</span>
                <span style={{ color: '#f0f0f0' }}>{ROLE_CARDS.find((r) => r.value === role)?.label ?? role}</span>
              </div>
              {labName && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#555555' }}>Lab</span>
                  <span style={{ color: '#f0f0f0' }}>{labName}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span style={{ color: '#555555' }}>Lab days / week</span>
                <span style={{ color: '#f0f0f0' }}>{daysPerWeek}</span>
              </div>
            </div>

            {error && <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>}

            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className="rounded-lg px-5 py-3 text-xs transition-opacity hover:opacity-70" style={{ border: '1px solid rgba(255,255,255,0.08)', color: '#888888', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                ← Back
              </button>
              <button
                onClick={handleFinish}
                disabled={saving}
                className="flex-1 rounded-lg py-3 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ background: '#e8a598', color: '#0a0a0a', letterSpacing: '0.1em', textTransform: 'uppercase' }}
              >
                {saving ? 'Saving…' : isPIOrPostdoc ? 'Continue →' : 'Start Working →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5 — Team invite (PI/Postdoc only) ──────────────────────── */}
        {step === 5 && (
          <div className="space-y-8">
            <div>
              <h1 className="font-serif text-4xl font-normal" style={{ color: '#f0f0f0' }}>Invite your team.</h1>
              <p className="mt-3 text-sm" style={{ color: '#888888' }}>
                Add your lab members. They&apos;ll get an invite and you can track their progress.
              </p>
            </div>

            <div>
              <label style={labelStyle}>Team member emails (one per line)</label>
              <textarea
                value={teamEmails}
                onChange={(e) => setTeamEmails(e.target.value)}
                placeholder={"student1@lab.edu\nstudent2@lab.edu"}
                rows={5}
                style={{ ...inputStyle, resize: 'none' }}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleInviteTeam}
                disabled={inviting}
                className="flex-1 rounded-lg py-3 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ background: '#e8a598', color: '#0a0a0a', letterSpacing: '0.1em', textTransform: 'uppercase' }}
              >
                {inviting ? 'Sending…' : teamEmails.trim() ? 'Send Invites →' : 'Continue →'}
              </button>
            </div>

            <button onClick={() => router.push('/dashboard')} className="w-full text-xs transition-opacity hover:opacity-60" style={{ color: '#555555', letterSpacing: '0.06em' }}>
              Skip for now →
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
