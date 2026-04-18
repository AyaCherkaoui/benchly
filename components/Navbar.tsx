'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/protocol', label: 'Protocols' },
  { href: '/samples', label: 'Samples' },
  { href: '/log', label: 'Daily Log' },
  { href: '/meeting', label: 'Lab Meeting' },
]

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="flex h-14 w-full items-center border-b border-slate-700/50 bg-[#0d1b2a] px-6">
      {/* Logo */}
      <Link href="/dashboard" className="mr-10 text-lg font-bold text-teal-400 flex-shrink-0">
        Benchly
      </Link>

      {/* Center nav links */}
      <div className="flex flex-1 items-center justify-center gap-1">
        {NAV.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`relative px-4 py-1.5 text-sm font-medium transition-colors ${
                active ? 'text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
              {active && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-teal-400" />
              )}
            </Link>
          )
        })}
      </div>

      {/* Right: sign out */}
      <button
        onClick={handleSignOut}
        className="flex-shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-700/40 hover:text-white"
      >
        Sign Out
      </button>
    </nav>
  )
}
