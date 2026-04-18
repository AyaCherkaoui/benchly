'use client'

import Navbar from '@/components/Navbar'
import BenchlyBar from '@/components/BenchlyBar'
import { ProtocolSessionProvider } from '@/contexts/ProtocolSessionContext'

/**
 * Client shell that provides ProtocolSessionContext and renders the
 * app chrome: BenchlyBar (top) → Navbar → page content.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ProtocolSessionProvider>
      <div className="flex min-h-screen flex-col bg-[#0d1b2a]">
        <BenchlyBar />
        <Navbar />
        <main className="flex-1 p-8 text-white">{children}</main>
      </div>
    </ProtocolSessionProvider>
  )
}
