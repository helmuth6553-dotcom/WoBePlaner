import React, { useState } from 'react'
import { AuthProvider, useAuth } from './AuthContext'
import Login from './components/Login'
import SetPassword from './components/SetPassword'
import RosterFeed from './components/RosterFeed'
import AbsencePlanner from './components/AbsencePlanner'
import Profile from './components/Profile'
import AdminDashboard from './components/AdminDashboard'
import BottomNav from './components/BottomNav'
import Sidebar from './components/Sidebar'
import TeamPanel from './components/TeamPanel'
import ErrorBoundary from './components/ErrorBoundary'
import TimeTracking from './components/TimeTracking'
import AdminTimeTracking from './components/AdminTimeTracking'
import SplashScreen from './components/SplashScreen'
import Impressum from './pages/Impressum'
import Datenschutz from './pages/Datenschutz'
import { Routes, Route } from 'react-router-dom'

function AppContent() {
  const { user, isAdmin, passwordSet, refreshPasswordSet } = useAuth()
  const [activeTab, setActiveTab] = useState('roster')
  const [calendarDate, setCalendarDate] = useState(null)

  const handleNavigateToCalendar = (date) => {
    setCalendarDate(new Date(date))
    setActiveTab('absences')
  }

  if (!user) return <Login />

  // Show password setup screen for new users who haven't set their password
  if (!passwordSet) {
    return <SetPassword user={user} onPasswordSet={refreshPasswordSet} />
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Desktop Sidebar (Hidden on Mobile) */}
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} isAdmin={isAdmin} />

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative bg-white">

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto scrollbar-hide pb-20 md:pb-0">
          {activeTab === 'roster' && <RosterFeed />}
          {activeTab === 'times' && (isAdmin ? <AdminTimeTracking /> : <TimeTracking />)}
          {activeTab === 'absences' && <AbsencePlanner initialDate={calendarDate} />}
          {activeTab === 'profile' && <Profile />}
          {activeTab === 'admin' && isAdmin && <AdminDashboard onNavigateToCalendar={handleNavigateToCalendar} />}
        </div>

        {/* Bottom Nav (Mobile Only) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0">
          <BottomNav activeTab={activeTab} onTabChange={setActiveTab} isAdmin={isAdmin} />
        </div>
      </div>

      {/* Team Panel (Desktop Only - only on roster view) */}
      {activeTab === 'roster' && <TeamPanel />}
    </div>
  )
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true)

  React.useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000)
    return () => clearTimeout(timer)
  }, [])

  if (showSplash) {
    return <SplashScreen />
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <Routes>
          <Route path="/impressum" element={<Impressum />} />
          <Route path="/datenschutz" element={<Datenschutz />} />
          <Route path="/*" element={<AppContent />} />
        </Routes>
      </AuthProvider>
    </ErrorBoundary>
  )
}
