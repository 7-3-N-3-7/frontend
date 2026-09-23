
import { LandingApp } from './landing/LandingApp'
import { PlatformApp } from './platform/PlatformApp'

const domain = import.meta.env.VITE_DOMAIN || 'localhost:5173'

export function AppRouter() {
  const hostname = window.location.host
  
  if (hostname === `platform.${domain}`) {
    return <PlatformApp />
  }
  
  // Default to landing page
  return <LandingApp />
}
