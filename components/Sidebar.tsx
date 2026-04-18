'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Calendar, FlaskConical, LayoutDashboard, LogOut, TestTube, Users } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/protocol', label: 'Protocol Walker', icon: FlaskConical },
  { href: '/samples', label: 'Samples', icon: TestTube },
  { href: '/log', label: 'Daily Log', icon: Calendar },
  { href: '/meeting', label: 'Lab Meeting', icon: Users },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="flex w-56 flex-col gap-1 border-r border-slate-700/50 bg-[#152235] px-3 py-6">
      <div className="mb-6 px-3">
        <span className="text-lg font-bold text-teal-400">Benchly</span>
      </div>

      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-teal-500/10 text-teal-400'
                : 'text-slate-400 hover:bg-slate-700/40 hover:text-white'
            }`}
          >
            <Icon size={18} />
            {label}
          </Link>
        )
      })}

      {/* Sign out at the bottom */}
      <div className="mt-auto border-t border-slate-700/50 pt-4">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-700/40 hover:text-white"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
