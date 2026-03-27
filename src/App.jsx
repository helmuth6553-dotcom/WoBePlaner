import { useState, useEffect, lazy, Suspense } from 'react'
import { AuthProvider, useAuth } from './AuthContext'
import { ShiftTemplateProvider } from './contexts/ShiftTemplateContext'
import Login from './components/Login'
import SetPassword from './components/SetPassword'
import RosterFeed from './components/RosterFeed'
import BottomNav from './components/BottomNav'
import Sidebar from './components/Sidebar'
import ErrorBoundary from './components/ErrorBoundary'
import SplashScreen from './components/SplashScreen'
import Impressum from './pages/Impressum'
import Datenschutz from './pages/Datenschutz'
import { Routes, Route } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import OfflineIndicator from './components/OfflineIndicator'
import ReloadPrompt from './components/ReloadPrompt'
import { supabase } from './supabase'
import { debounce } from './utils/debounce'

// Lazy load heavy components for better initial load time
const AbsencePlanner = lazy(() => import('./components/AbsencePlanner'))
const Profile = lazy(() => import('./components/Profile'))
const AdminDashboard = lazy(() => import('./components/AdminDashboard'))
const TimeTracking = lazy(() => import('./components/TimeTracking'))
const TimeTrackingV2 = lazy(() => import('./components/TimeTrackingV2'))
const AdminTimeTracking = lazy(() => import('./components/AdminTimeTracking'))

// Feature Flag: Set to true to test the new TimeTrackingV2 component
const USE_NEW_TIME_TRACKING = false

import { USE_COVERAGE_VOTING } from './featureFlags'

// Loading fallbacks for lazy components - using skeleton loading
import { RosterFeedSkeleton, TimeTrackingSkeleton, ProfileSkeleton, PageSkeleton } from './components/Skeleton'

// Generic fallback (used when context unknown)
const LazyLoadFallback = () => <PageSkeleton />

function AppContent() {
  const { user, isAdmin, passwordSet, refreshPasswordSet } = useAuth()
  const [activeTab, setActiveTab] = useState('roster')
  const [calendarDate, setCalendarDate] = useState(null)
  const [badges, setBadges] = useState({})
  const [openCoverageCount, setOpenCoverageCount] = useState(0)

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

    // Subscribe to realtime updates (debounced to avoid cascade fetches)
    const debouncedBadgeFetch = debounce(fetchBadgeCounts, 1000)
    let badgeWasConnected = false
    const channel = supabase
      .channel('badge-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'absences' }, debouncedBadgeFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, debouncedBadgeFetch)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (badgeWasConnected) fetchBadgeCounts()
          badgeWasConnected = true
        }
      })

    return () => { supabase.removeChannel(channel) }
  }, [user, isAdmin])

  // Fetch open coverage requests for non-admin users (only when voting system is active)
  const refreshCoverageCount = async () => {
    if (!USE_COVERAGE_VOTING || !user || isAdmin) {
      setOpenCoverageCount(0)
      return
    }
    try {
      // Only count votes that were created FOR this user (excludes sick person)
      const { data: myPendingVotes } = await supabase
        .from('coverage_votes')
        .select('shift_id')
        .eq('user_id', user.id)
        .eq('responded', false)

      if (!myPendingVotes?.length) {
        setOpenCoverageCount(0)
        return
      }

      // Filter to only shifts with open coverage requests
      const shiftIds = myPendingVotes.map(v => v.shift_id)
      const { data: openReqs } = await supabase
        .from('coverage_requests')
        .select('shift_id')
        .in('shift_id', shiftIds)
        .eq('status', 'open')

      setOpenCoverageCount(openReqs?.length || 0)
    } catch (err) {
      console.error('Failed to fetch coverage count:', err)
    }
  }

  useEffect(() => {
    if (!USE_COVERAGE_VOTING || !user || isAdmin) {
      setOpenCoverageCount(0)
      return
    }

    refreshCoverageCount()

    const debouncedCoverageFetch = debounce(refreshCoverageCount, 1000)
    let coverageWasConnected = false
    const channel = supabase
      .channel('coverage-banner')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coverage_requests' }, debouncedCoverageFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coverage_votes' }, debouncedCoverageFetch)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (coverageWasConnected) refreshCoverageCount()
          coverageWasConnected = true
        }
      })

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
      <ReloadPrompt />

      {/* Desktop Sidebar (Hidden on Mobile) */}
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} isAdmin={isAdmin} badges={badges} />

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative bg-slate-50">

        {/* Coverage Alert Banner - shown on all tabs (only with voting system) */}
        {USE_COVERAGE_VOTING && openCoverageCount > 0 && (
          <button
            onClick={() => {
              if (activeTab !== 'roster') {
                setActiveTab('roster')
                // Scroll after tab switch renders
                setTimeout(() => document.getElementById('coverage-voting-section')?.scrollIntoView({ behavior: 'smooth' }), 300)
              } else {
                document.getElementById('coverage-voting-section')?.scrollIntoView({ behavior: 'smooth' })
              }
            }}
            className="w-full py-2.5 px-4 bg-red-600 text-white text-sm font-bold flex items-center justify-center gap-2 animate-pulse hover:bg-red-700 transition-colors"
          >
            <span>⚠️</span>
            <span>{openCoverageCount} offene{openCoverageCount === 1 ? 'r Dienst braucht' : ' Dienste brauchen'} deine Antwort</span>
            <span>→ Jetzt abstimmen</span>
          </button>
        )}

        {/* Scrollable Content Area - Lazy components wrapped in Suspense */}
        {/* Disable App-level scroll for roster tab because RosterFeed uses PullToRefresh which has its own scroll container */}
        <div className={`flex-1 ${activeTab === 'roster' ? 'overflow-hidden' : 'overflow-y-auto'} scrollbar-hide pb-20 md:pb-0`}>

          {activeTab === 'roster' && <RosterFeed onCoverageVoteChanged={refreshCoverageCount} />}
          {activeTab === 'times' && (
            <Suspense fallback={<TimeTrackingSkeleton />}>
              {isAdmin ? <AdminTimeTracking /> : (USE_NEW_TIME_TRACKING ? <TimeTrackingV2 /> : <TimeTracking />)}
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
