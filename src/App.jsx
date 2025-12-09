import { useState } from 'react'
import { AuthProvider, useAuth } from './AuthContext'
import Login from './components/Login'
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

function AppContent() {
  const { user, isAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState('roster')

  if (!user) return <Login />

  return (
    <div className="bg-gray-200 min-h-screen flex justify-center items-center p-4 md:p-0 md:bg-gray-50">
      {/* 
          Mobile: Simulator Container (Fixed Width, Borders)
          Desktop: Full Screen (No Borders, Flex Row)
      */}
      <div className="
        w-full max-w-[400px] h-[850px]
        bg-white shadow-2xl overflow-hidden relative flex flex-col transform scale-100
        rounded-[40px] border-[12px] border-gray-900 
        md:max-w-none md:h-screen md:rounded-none md:border-0 md:shadow-none md:flex-row
      ">

        {/* Desktop Sidebar (Hidden on Mobile) */}
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} isAdmin={isAdmin} />

        {/* Main Content Wrapper */}
        <div className="flex-1 flex flex-col h-full overflow-hidden relative">

          {/* Status Bar (Mobile Only) */}
          <div className="h-8 bg-white w-full flex justify-between items-center px-6 select-none z-50 shrink-0 md:hidden">
            <span className="text-xs font-bold">9:41</span>
            <div className="flex gap-1">
              <div className="w-4 h-2.5 bg-black rounded-sm"></div>
              <div className="w-0.5 h-2.5 bg-black/30 rounded-sm"></div>
            </div>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto scrollbar-hide pb-20 bg-white relative">
            {activeTab === 'roster' && <RosterFeed />}
            {activeTab === 'times' && (isAdmin ? <AdminTimeTracking /> : <TimeTracking />)}
            {activeTab === 'absences' && <AbsencePlanner />}
            {activeTab === 'profile' && <Profile />}
            {activeTab === 'admin' && isAdmin && <AdminDashboard />}
          </div>
        </div>

        {/* Team Panel (Desktop Only - only on roster view) */}
        {activeTab === 'roster' && <TeamPanel />}

        {/* Bottom Nav (Mobile Only) */}
        <div className="md:hidden">
          <BottomNav activeTab={activeTab} onTabChange={setActiveTab} isAdmin={isAdmin} />
        </div>

        {/* Home Indicator (Mobile Only) */}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-32 h-1 bg-gray-900 rounded-full z-50 pointer-events-none md:hidden"></div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  )
}
