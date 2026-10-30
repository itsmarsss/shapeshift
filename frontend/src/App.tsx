import { lazy, Suspense } from 'react'
import Layout from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'

const WaitlistPage = lazy(() => import('./waitlist/WaitlistPage'))

function App() {
  const waitlist = location.pathname.replace(/\/$/, '') === '/waitlist'
  return (
    <ErrorBoundary>
      {waitlist ? (
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
