import re

with open('src/platform/pages/Dashboard.tsx', 'r') as f:
    content = f.read()

content = content.replace('import { Button } from "@/components/ui/button"',
                          'import { Button } from "@/components/ui/button"\nimport { LanguageSwitcher } from "@/components/LanguageSwitcher"\nimport { useI18n } from "@/lib/i18n"')

content = content.replace('export function Dashboard() {',
                          'export function Dashboard() {\n  const { t } = useI18n();')

content = content.replace('<h1 className="text-xl font-bold text-slate-900">Platform Dashboard</h1>',
                          '<h1 className="text-xl font-bold text-slate-900" data-testid="nav-overview">{t("nav_overview", "Overview")}</h1>')

content = content.replace('<Button variant="outline" onClick={handleLogout}>',
                          '<LanguageSwitcher />\n        <Button variant="outline" onClick={handleLogout}>')

with open('src/platform/pages/Dashboard.tsx', 'w') as f:
    f.write(content)
