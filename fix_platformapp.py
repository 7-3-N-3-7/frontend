import re

with open('src/platform/PlatformApp.tsx', 'r') as f:
    content = f.read()

# Add import
content = content.replace("import { QueryClient, QueryClientProvider } from '@tanstack/react-query'", 
                          "import { QueryClient, QueryClientProvider } from '@tanstack/react-query'\nimport { I18nProvider } from '../lib/i18n'")

# Wrap Outlet
content = content.replace("<Outlet />", 
                          "<I18nProvider>\n        <Outlet />\n      </I18nProvider>")

with open('src/platform/PlatformApp.tsx', 'w') as f:
    f.write(content)
