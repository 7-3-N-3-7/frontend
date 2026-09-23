import { useState } from 'react'
import { Button } from "@/components/ui/button"

export function Home() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // NOTE: Keycloak ROPC does NOT support user registration via this endpoint.
  // Registration must be done via the Keycloak Admin REST API from a secure backend, 
  // or by redirecting the user to Keycloak's registration page.
  
  // Configure your Realm and Client ID here
  // Configure your Realm and Client ID here
  const REALM = "api-backend" // Replace with your actual realm name if different
  const CLIENT_ID = "platform-frontend"

  const domain = import.meta.env.VITE_DOMAIN || 'localhost:5173'
  const protocol = domain.includes('localhost') ? 'http' : 'https'
  
  // The base URL for your IAM API
  const iamApiUrl = import.meta.env.VITE_IAM_URL || 'https://login.157.180.43.151.nip.io'

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      // 1. URL Encoded body is required for Keycloak's token endpoint
      const body = new URLSearchParams()
      body.append('grant_type', 'password')
      body.append('client_id', CLIENT_ID)
      body.append('username', username)
      body.append('password', password)

      // 2. Make the Direct Access Grant (ROPC) call
      const response = await fetch(`${iamApiUrl}/realms/${REALM}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString()
      })

      if (!response.ok) {
        throw new Error('Authentication failed. Check credentials.')
      }

      const data = await response.json()
      
      // 3. Store the token. To share it with platform.localhost, we set a cookie on the root domain!
      // We extract just the base domain (e.g. 'localhost' or '157.180.43.151.nip.io') without the port.
      const baseDomain = domain.split(':')[0]
      
      // Set a cookie valid for the entire domain and subdomains
      document.cookie = `access_token=${data.access_token}; domain=.${baseDomain}; path=/; max-age=${data.expires_in}; SameSite=Lax; ${protocol === 'https' ? 'Secure' : ''}`

      // Optional: store the refresh_token similarly if you need to refresh sessions
      // document.cookie = `refresh_token=${data.refresh_token}; domain=.${baseDomain}; path=/; SameSite=Lax; ${protocol === 'https' ? 'Secure' : ''}`

      // 4. Redirect to the platform app
      window.location.href = `${protocol}://platform.${domain}`
    } catch (error) {
      console.error(error)
      alert("Failed to authenticate. Have you configured 'Direct Access Grants' for your client in Keycloak?")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white p-8 rounded shadow text-center space-y-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          Therapist Booking
        </h1>
        <p className="text-sm text-slate-500">Sign in to your account</p>
        
        <form onSubmit={handleLogin} className="flex flex-col space-y-4">
          <input 
            type="text" 
            placeholder="Username" 
            className="border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
          />
          <input 
            type="password" 
            placeholder="Password" 
            className="border p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? 'Authenticating...' : 'Login'}
          </Button>
        </form>
      </div>
    </div>
  )
}