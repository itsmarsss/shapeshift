import { lazy, Suspense } from 'react'
import Layout from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { seemsSignedIn } from './account/store'

const WaitlistPage = lazy(() => import('./waitlist/WaitlistPage'))
const ViewerPage = lazy(() => import('./viewer/ViewerPage'))
const HomePage = lazy(() => import('./home/HomePage'))
const PricingPage = lazy(() => import('./pricing/PricingPage'))

function App() {
  const path = location.pathname.replace(/\/$/, '')
  const share = path.match(/^\/s\/([A-Za-z0-9]{10})$/)
  // Signed-in people land on their scenes; everyone else goes straight to the
  // editor. Links with anything extra, such as a room to join, always open it.
  const home = path === '' && !location.search && seemsSignedIn()
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
