import App from './App.tsx'
import HomePage from './HomePage.tsx'

function Root() {
  return window.location.pathname === '/workspace' ? <App /> : <HomePage />
}

export default Root
