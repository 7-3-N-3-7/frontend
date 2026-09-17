const common = {
  requireModule: ['tsx/cjs'],
  require: ['steps/**/*.ts', 'support/**/*.ts'], // Ensure it loads support/CustomWorld.ts
  format: [
    'progress-bar',
    'html:reports/cucumber-report.html',
    'json:reports/cucumber-report.json' // JSON for GitHub Actions dashboards
  ],
  formatOptions: { snippetInterface: 'async-await' },
  parallel: 4, // Run 4 scenarios concurrently
  retry: 2,    // Auto-retry flaky tests twice before failing the CI pipeline
};

module.exports = {
  // Default profile (runs everything if you just run 'npm run cucumber')
  default: {
    ...common,
    paths: ['features/**/*.feature'],
  },
  
  // Profile specifically for Infrastructure gating
  infra: {
    ...common,
    paths: ['features/infrastructure.feature'],
    // Or you can use tags: tags: '@infra'
  },
  
  // Profile specifically for Frontend UI E2E
  ui: {
    ...common,
    paths: ['features/rbac.feature'],
    // Or you can use tags: tags: '@ui'
  }
};
