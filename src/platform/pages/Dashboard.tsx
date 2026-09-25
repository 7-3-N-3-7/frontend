import { Button } from "@/components/ui/button"

export function Dashboard() {
  const domain = import.meta.env.VITE_DOMAIN || 'localhost:5173'
  const protocol = window.location.protocol.replace(':', '')

  const handleLogout = () => {
    // Clear the access_token cookie by expiring it
    const baseDomain = domain.split(':')[0]
    document.cookie = `access_token=; domain=.${baseDomain}; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;`
    
    // Redirect to the landing page
    window.location.href = `${protocol}://${domain}`
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Platform Dashboard</h1>
        <Button variant="outline" onClick={handleLogout}>
          Logout
        </Button>
      </header>
      <main className="p-6">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold mb-4">Welcome back!</h2>
          <p className="text-slate-600 mb-4">
            You are currently on the platform subdomain. The IAM has successfully authenticated you and set a secure cookie on the main domain.
          </p>
          <div className="bg-slate-100 p-4 rounded text-sm text-slate-800 font-mono">
            Current Host: {window.location.host}
          </div>
        </div>
      </main>
    </div>
  )
}
