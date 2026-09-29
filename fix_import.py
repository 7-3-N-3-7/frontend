import re

with open('e2e/steps/localization.steps.ts', 'r') as f:
    content = f.read()

content = content.replace("import { page } from './app.steps';", "import { page } from './app.steps.ts';")

with open('e2e/steps/localization.steps.ts', 'w') as f:
    f.write(content)
