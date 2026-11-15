export default {
  paths: ["../specs/features/**/*.feature"],
  import: ["features/support/**/*.ts", "features/step_definitions/**/*.ts"],
  format: [
    "progress-bar",
    "summary",
    "html:reports/cucumber-report.html",
  ],
  publishQuiet: true,
};
