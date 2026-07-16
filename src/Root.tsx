import { useEffect, useState } from 'react'
import App from './App.tsx'
import HomePage from './HomePage.tsx'

function Root() {
  const [isWorkspace, setIsWorkspace] = useState(
    () => window.location.hash === '#/workspace',
  )

  useEffect(() => {
    const syncRoute = () => setIsWorkspace(window.location.hash === '#/workspace')
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])

  return isWorkspace ? <App /> : <HomePage />
}

export default Root
