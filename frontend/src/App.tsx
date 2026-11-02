import { lazy, Suspense } from 'react'
import Layout from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { seemsSignedIn } from './account/store'

const WaitlistPage = lazy(() => import('./waitlist/WaitlistPage'))
const ViewerPage = lazy(() => import('./viewer/ViewerPage'))
const HomePage = lazy(() => import('./home/HomePage'))
const PricingPage = lazy(() => import('./pricing/PricingPage'))
const ExplorePage = lazy(() => import('./explore/ExplorePage'))
const LandingPage = lazy(() => import('./landing/LandingPage'))

function App() {
  const path = location.pathname.replace(/\/$/, '')
  const share = path.match(/^\/s\/([A-Za-z0-9]{10})$/)
  // The front door: signed-in people land on their scenes, everyone else on
  // the landing page. Links with anything extra, such as a room to join,
  // open the editor, as they did before it moved to /edit.
  const front = path === '' && !location.search
  const home = front && seemsSignedIn()
  const landing = front && !home
  return (
    <ErrorBoundary>
      {share ? (
        <Suspense fallback={null}>
          <ViewerPage slug={share[1]} />
        </Suspense>
      ) : home ? (
        <Suspense fallback={null}>
          <HomePage />
        </Suspense>
      ) : landing ? (
        <Suspense fallback={null}>
          <LandingPage />
        </Suspense>
      ) : path === '/explore' ? (
        <Suspense fallback={null}>
          <ExplorePage />
        </Suspense>
      ) : path === '/pricing' ? (
        <Suspense fallback={null}>
          <PricingPage />
        </Suspense>
      ) : path === '/waitlist' ? (
        <Suspense fallback={null}>
          <WaitlistPage />
        </Suspense>
      ) : (
        <Layout />
      )}
    </ErrorBoundary>
  )
}

export default App
