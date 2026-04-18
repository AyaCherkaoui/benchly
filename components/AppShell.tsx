'use client'

import { motion } from 'framer-motion'
import { Toaster } from 'sonner'
import Navbar from '@/components/Navbar'
import BenchlyBar from '@/components/BenchlyBar'
import AIChat from '@/components/AIChat'
import { ProtocolSessionProvider } from '@/contexts/ProtocolSessionContext'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ProtocolSessionProvider>
      <div className="flex min-h-screen flex-col" style={{ background: 'var(--bg-primary)' }}>
        <BenchlyBar />
        <Navbar />
        <motion.main
          className="flex-1 p-8"
          style={{ color: 'var(--text-primary)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          {children}
        </motion.main>
      </div>
      <AIChat />
      <Toaster
        theme="dark"
        position="bottom-left"
        toastOptions={{
          style: {
            background: '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#f0f0f0',
            fontSize: 13,
          },
        }}
      />
    </ProtocolSessionProvider>
  )
}
