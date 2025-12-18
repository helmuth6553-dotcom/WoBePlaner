import { useState, useEffect, lazy, Suspense } from 'react'
import { AuthProvider, useAuth } from './AuthContext'
import { ShiftTemplateProvider } from './contexts/ShiftTemplateContext'
import Login from './components/Login'
import SetPassword from './components/SetPassword'
import RosterFeed from './components/RosterFeed'
import BottomNav from './components/BottomNav'
import Sidebar from './components/Sidebar'
import TeamPanel from './components/TeamPanel'
import ErrorBoundary from './components/ErrorBoundary'
import SplashScreen from './components/SplashScreen'
import Impressum from './pages/Impressum'
import Datenschutz from './pages/Datenschutz'
import { Routes, Route } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import OfflineIndicator from './components/OfflineIndicator'
import { supabase } from './supabase'

// Lazy load heavy components for better initial load time
const AbsencePlanner = lazy(() => import('./components/AbsencePlanner'))
const Profile = lazy(() => import('./components/Profile'))
const AdminDashboard = lazy(() => import('./components/AdminDashboard'))
const TimeTracking = lazy(() => import('./components/TimeTracking'))
const AdminTimeTracking = lazy(() => import('./components/AdminTimeTracking'))

// Loading fallbacks for lazy components - using skeleton loading
import { RosterFeedSkeleton, TimeTrackingSkeleton, ProfileSkeleton, PageSkeleton } from './components/Skeleton'

// Generic fallback (used when context unknown)
const LazyLoadFallback = () => <PageSkeleton />

function AppContent() {
  const { user, isAdmin, passwordSet, refreshPasswordSet } = useAuth()
  const [activeTab, setActiveTab] = useState('roster')
  const [calendarDate, setCalendarDate] = useState(null)
  const [badges, setBadges] = useState({})

  // Fetch badge counts for navigation
  useEffect(() => {
    if (!user || !isAdmin) {
      setBadges({})
      return
    }

    const fetchBadgeCounts = async () => {
      try {
        // Count pending absence requests
        const { count: pendingAbsences } = await supabase
          .from('absences')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'beantragt')

        // Count urgent shifts (shifts with urgent_since set)
        const { count: urgentShifts } = await supabase
          .from('shifts')
          .select('*', { count: 'exact', head: true })
          .not('urgent_since', 'is', null)

        const adminCount = (pendingAbsences || 0) + (urgentShifts || 0)

        setBadges({
          admin: adminCount > 0 ? { count: adminCount } : null,
          roster: urgentShifts > 0 ? { dot: true } : null
        })
      } catch (err) {
        console.error('Failed to fetch badge counts:', err)
      }
    }

    fetchBadgeCounts()

    // Subscribe to realtime updates
    const channel = supabase
      .channel('badge-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'absences' }, fetchBadgeCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, fetchBadgeCounts)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, isAdmin])

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
      {/* Offline Status Banner */}
      <OfflineIndicator />

      {/* Desktop Sidebar (Hidden on Mobile) */}
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} isAdmin={isAdmin} badges={badges} />

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative bg-white">

        {/* Scrollable Content Area - Lazy components wrapped in Suspense */}
        <div className="flex-1 overflow-y-auto scrollbar-hide pb-20 md:pb-0">
          {activeTab === 'roster' && <RosterFeed />}
          {activeTab === 'times' && (
            <Suspense fallback={<TimeTrackingSkeleton />}>
              {isAdmin ? <AdminTimeTracking /> : <TimeTracking />}
            </Suspense>
          )}
          {activeTab === 'absences' && (
            <Suspense fallback={<LazyLoadFallback />}>
              <AbsencePlanner initialDate={calendarDate} />
            </Suspense>
          )}
          {activeTab === 'profile' && (
            <Suspense fallback={<ProfileSkeleton />}>
              <Profile />
            </Suspense>
          )}
          {activeTab === 'admin' && isAdmin && (
            <Suspense fallback={<LazyLoadFallback />}>
              <AdminDashboard onNavigateToCalendar={handleNavigateToCalendar} />
            </Suspense>
          )}
        </div>

        {/* Bottom Nav (Mobile Only) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0">
          <BottomNav activeTab={activeTab} onTabChange={setActiveTab} isAdmin={isAdmin} badges={badges} />
        </div>
      </div>

      {/* Team Panel (Desktop Only - only on roster view) */}
      {activeTab === 'roster' && <TeamPanel />}
    </div>
  )
}

// Wrapper component that shows splash while auth is loading
function AuthenticatedApp() {
  const { loading } = useAuth()

  // Show splash screen only while auth is loading
  if (loading) {
    return <SplashScreen />
  }

  return <AppContent />
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <ShiftTemplateProvider>
            <Routes>
              <Route path="/impressum" element={<Impressum />} />
              <Route path="/datenschutz" element={<Datenschutz />} />
              <Route path="/*" element={<AuthenticatedApp />} />
            </Routes>
          </ShiftTemplateProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}
