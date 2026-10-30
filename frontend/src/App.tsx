import { lazy, Suspense } from 'react'
import Layout from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'

const WaitlistPage = lazy(() => import('./waitlist/WaitlistPage'))
const ViewerPage = lazy(() => import('./viewer/ViewerPage'))

function App() {
  const path = location.pathname.replace(/\/$/, '')
  const share = path.match(/^\/s\/([A-Za-z0-9]{10})$/)
  return (
    <ErrorBoundary>
      {share ? (
        <Suspense fallback={null}>
          <ViewerPage slug={share[1]} />
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
