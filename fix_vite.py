import re

with open('vite.config.ts', 'r') as f:
    content = f.read()

proxy_api = '''
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/realms': {'''

content = content.replace("'/realms': {", proxy_api)

with open('vite.config.ts', 'w') as f:
    f.write(content)
