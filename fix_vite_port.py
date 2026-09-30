import re

with open('vite.config.ts', 'r') as f:
    content = f.read()

content = content.replace("target: 'http://localhost:8080',", "target: 'http://localhost:8081',")

with open('vite.config.ts', 'w') as f:
    f.write(content)
