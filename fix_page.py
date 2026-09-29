import re

with open('e2e/steps/app.steps.ts', 'r') as f:
    content = f.read()

content = content.replace('let browser: Browser;', 'export let browser: Browser;')
content = content.replace('let page: Page;', 'export let page: Page;')

with open('e2e/steps/app.steps.ts', 'w') as f:
    f.write(content)
