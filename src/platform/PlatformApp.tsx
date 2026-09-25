import { RouterProvider, createRouter, createRoute, createRootRoute, Outlet } from '@tanstack/react-router'
import { Dashboard } from './pages/Dashboard'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

const rootRoute = createRootRoute({
  beforeLoad: () => {
    // Simple check to ensure the access_token cookie is present
    const hasToken = document.cookie.includes('access_token=')
    if (!hasToken) {
      const domain = import.meta.env.VITE_DOMAIN || 'localhost:5173'
      const protocol = window.location.protocol.replace(':', '')
      // Hard redirect to the main domain's login page
      window.location.href = `${protocol}://${domain}/login`
    }
  },
  component: () => (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Dashboard,
})

const routeTree = rootRoute.addChildren([indexRoute])

const router = createRouter({ routeTree })

export function PlatformApp() {
  return <RouterProvider router={router} />
}
