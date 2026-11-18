import fs from "node:fs";

if (!fs.existsSync("reports")) {
  fs.mkdirSync("reports");
}

export default {
  paths: ["../specs/features/**/*.feature"],
  import: ["features/support/**/*.ts", "features/step_definitions/**/*.ts"],
  format: [
    "progress-bar",
    "summary",
    "html:reports/cucumber-report.html",
    "json:reports/cucumber-report.json",
  ],
  publishQuiet: true,
};
