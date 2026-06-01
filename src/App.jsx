import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore, useGameStore } from './store'
import AppLayout from './components/layout/AppLayout'
import Auth       from './pages/Auth'
import Onboarding from './pages/Onboarding'
import Dashboard  from './pages/Dashboard'
import FoodLog    from './pages/FoodLog'
import Quests     from './pages/Quests'
import Character  from './pages/Character'
import ARIAPage   from './pages/ARIA'
import { Spinner } from './components/ui'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuthStore()
  if (loading) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-float">⚔️</div>
          <Spinner size="lg" />
          <p className="text-text-muted font-ui text-sm mt-4">Loading realm...</p>
        </div>
      </div>
    )
  }
  return user ? children : <Navigate to="/auth" replace />
}

function GameLayout({ children }) {
  const { user } = useAuthStore()
  const { loadProfile } = useGameStore()

  useEffect(() => {
    if (user) loadProfile(user.id)
  }, [user?.id])

  return <AppLayout>{children}</AppLayout>
}

export default function App() {
  const { init } = useAuthStore()
  useEffect(() => { init() }, [])

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#13132e',
            color: '#e2e8f0',
            border: '1px solid #1e1e4a',
            fontFamily: '"Exo 2", sans-serif',
            fontSize: '0.875rem',
          },
          success: { iconTheme: { primary: '#f5a623', secondary: '#07070f' } },
          error:   { iconTheme: { primary: '#f43f5e', secondary: '#07070f' } },
        }}
      />
      <Routes>
        <Route path="/auth"       element={<Auth />} />
        <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
        <Route path="/dashboard"  element={<ProtectedRoute><GameLayout><Dashboard /></GameLayout></ProtectedRoute>} />
        <Route path="/log"        element={<ProtectedRoute><GameLayout><FoodLog /></GameLayout></ProtectedRoute>} />
        <Route path="/quests"     element={<ProtectedRoute><GameLayout><Quests /></GameLayout></ProtectedRoute>} />
        <Route path="/character"  element={<ProtectedRoute><GameLayout><Character /></GameLayout></ProtectedRoute>} />
        <Route path="/aria"       element={<ProtectedRoute><GameLayout><ARIAPage /></GameLayout></ProtectedRoute>} />
        <Route path="*"           element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
