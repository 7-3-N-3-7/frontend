import { RouterProvider, createRouter, createRoute, createRootRoute, Outlet } from '@tanstack/react-router'
import { Dashboard } from './pages/Dashboard'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

const rootRoute = createRootRoute({
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
