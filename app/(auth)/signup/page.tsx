'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase'

const ROLES = [
  { value: 'intern', label: 'Intern' },
  { value: 'lab_assistant', label: 'Lab Assistant' },
  { value: 'phd', label: 'PhD Student' },
  { value: 'masters', label: 'Masters Student' },
  { value: 'postdoc', label: 'Postdoc' },
  { value: 'pi', label: 'PI' },
]

export default function SignupPage() {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(ROLES[0].value)
  const [labName, setLabName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: signUpError } = await supabase.auth.signUp({ email, password })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError || !signInData.user) {
      setError(signInError?.message ?? 'Could not sign in after signup')
      setLoading(false)
      return
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: signInData.user.id,
      full_name: fullName,
      role,
      lab_name: labName,
    })

    if (profileError) {
      setError(profileError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0d1b2a] py-12">
      <div className="w-full max-w-md rounded-2xl bg-[#152235] p-8 shadow-xl">
        <h1 className="mb-2 text-2xl font-bold text-white">Create your account</h1>
        <p className="mb-6 text-sm text-slate-400">Join Benchly and start running protocols</p>

        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-300">Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="Jane Smith"
              className="rounded-lg bg-[#0d1b2a] px-4 py-2.5 text-white placeholder-slate-500 outline-none ring-1 ring-slate-600 focus:ring-teal-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-300">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@lab.edu"
              className="rounded-lg bg-[#0d1b2a] px-4 py-2.5 text-white placeholder-slate-500 outline-none ring-1 ring-slate-600 focus:ring-teal-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="rounded-lg bg-[#0d1b2a] px-4 py-2.5 text-white placeholder-slate-500 outline-none ring-1 ring-slate-600 focus:ring-teal-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-300">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-lg bg-[#0d1b2a] px-4 py-2.5 text-white outline-none ring-1 ring-slate-600 focus:ring-teal-500"
            >
              {ROLES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-300">Lab name</label>
            <input
              type="text"
              value={labName}
              onChange={(e) => setLabName(e.target.value)}
              required
              placeholder="Smith Lab"
              className="rounded-lg bg-[#0d1b2a] px-4 py-2.5 text-white placeholder-slate-500 outline-none ring-1 ring-slate-600 focus:ring-teal-500"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-teal-500 py-2.5 font-semibold text-white transition hover:bg-teal-400 disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link href="/login" className="text-teal-400 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
