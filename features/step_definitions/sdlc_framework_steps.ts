import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { After, Given, Then, When } from "@cucumber/cucumber";
import {
  type BranchPlan,
  type ProjectStatus,
  type SdlcConfig,
  type SdlcEvaluationResult,
  type SpecTarget,
  evaluateSdlcState,
  parseCucumberJsonReport,
  resolveBranchPlan,
} from "../../../sdlc/core/sdlc-domain.ts";
import { loadSdlcConfig, syncIssueToFeature } from "../../../sdlc/core/sdlc-github.ts";

interface SdlcScenarioState {
  config?: SdlcConfig;
  tempRoot?: string;
  branchPlan?: BranchPlan;
  syncedStatus?: ProjectStatus;
  evaluation?: SdlcEvaluationResult;
}

const scenarioStates = new WeakMap<object, SdlcScenarioState>();

function getState(world: object): SdlcScenarioState {
  let state = scenarioStates.get(world);
  if (!state) {
    state = {};
    scenarioStates.set(world, state);
  }
  return state;
}

function removeTreeSync(targetPath: string): void {
  if (!fs.existsSync(targetPath)) return;
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    const child = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      removeTreeSync(child);
    } else {
      fs.unlinkSync(child);
    }
  }
  fs.rmdirSync(targetPath);
}

After({ tags: "@sdlc" }, function () {
  const state = getState(this);
  if (state.tempRoot) {
    removeTreeSync(state.tempRoot);
    state.tempRoot = undefined;
  }
});

Given(
  "SDLC configuration loaded from {string} with strict 100% thresholds on JaCoCo and Istanbul",
  function (configName: string) {
    const state = getState(this);
    const repoRoot = path.resolve(process.cwd(), "..");
    assert.equal(configName, "sdlc.config.json");
    const config = loadSdlcConfig(repoRoot);
    assert.equal(config.branches.integration, "dev");
    assert.equal(config.branches.prefix, "feature");
    assert.equal(config.gates.targets.backend.minLineCoverage, 1.0);
    assert.equal(config.gates.targets.backend.minBranchCoverage, 1.0);
    assert.equal(config.gates.targets.backend.minInstructionCoverage, 1.0);
    assert.equal(config.gates.targets.backend.minComplexityCoverage, 1.0);
    assert.equal(config.gates.targets.backend.minMethodCoverage, 1.0);
    assert.equal(config.gates.targets.backend.minClassCoverage, 1.0);
    assert.equal(config.gates.targets.frontend.minLineCoverage, 1.0);
    assert.equal(config.gates.targets.frontend.minStatementCoverage, 1.0);
    assert.equal(config.gates.targets.frontend.minFunctionCoverage, 1.0);
    assert.equal(config.gates.targets.frontend.minBranchCoverage, 1.0);
    state.config = config;
  }
);

When(
  "SDLC synchronizes GitHub Issue {int} titled {string} with slice {string} and target {string}",
  async function (issueId: number, title: string, slice: string, target: string) {
    const state = getState(this);
    assert.ok(state.config);
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "edujournal-sdlc-"));
    state.tempRoot = tmpRoot;
    fs.copyFileSync(
      path.resolve(process.cwd(), "..", "sdlc.config.json"),
      path.join(tmpRoot, "sdlc.config.json")
    );

    const body = [
      "### Vertical Slice",
      slice,
      "### Target",
      target,
      "### Gherkin Specification",
      "```gherkin",
      `Feature: ${title}`,
      "  Scenario: Synced board flow",
      "    Given board config exists",
      "    When issue sync runs",
      "    Then linked branch is created",
      "```",
    ].join("\n");

    const synced = await syncIssueToFeature(
      { rootDir: tmpRoot, issueId, title, body },
      { dryRun: true, log: () => {} }
    );
    state.branchPlan = synced.branchPlan;
    state.syncedStatus = synced.nextStatus;
  }
);

Then(
  "SDLC resolves linked branch {string} from base branch {string}",
  function (expectedBranch: string, expectedBase: string) {
    const state = getState(this);
    assert.ok(state.branchPlan);
    assert.equal(state.branchPlan.branchName, expectedBranch);
    assert.equal(state.branchPlan.baseBranch, expectedBase);
  }
);

Then(
  "SDLC transitions Issue {int} to project status {string}",
  function (issueId: number, expectedStatus: string) {
    const state = getState(this);
    assert.ok(issueId > 0);
    assert.equal(state.syncedStatus, expectedStatus);
  }
);

When(
  "SDLC resolves child branch for Sub-Issue {int} titled {string} under parent branch {string}",
  function (childIssueId: number, title: string, parentBranch: string) {
    const state = getState(this);
    assert.ok(state.config);
    state.branchPlan = resolveBranchPlan(
      { issueId: childIssueId, title, parentBranch },
      state.config
    );
  }
);

Then(
  "SDLC resolves child branch {string} from base branch {string}",
  function (expectedBranch: string, expectedBase: string) {
    const state = getState(this);
    assert.ok(state.branchPlan);
    assert.equal(state.branchPlan.branchName, expectedBranch);
    assert.equal(state.branchPlan.baseBranch, expectedBase);
  }
);

When(
  "SDLC evaluates Issue {int} with passing Backend and Frontend 100% gates while Sub-Issue {int} has status {string}",
  function (parentIssueId: number, childIssueId: number, childStatus: ProjectStatus) {
    const state = getState(this);
    assert.ok(state.config);
    const fullBdd = {
      totalScenarios: 1,
      passedScenarios: 1,
      failedScenarios: 0,
      byIssue: { [parentIssueId]: { passed: 1, failed: 0 } },
      brokenIssueIds: [],
    };
    state.evaluation = evaluateSdlcState(
      {
        issueId: parentIssueId,
        target: state.config.specs.fullstackTag as SpecTarget,
        specValid: true,
        hasLinkedBranch: true,
        hasImplementationCommits: true,
        isPreviouslyDone: false,
        isMerged: false,
        subIssues: [{ issueId: childIssueId, title: "Child Sub-Issue", status: childStatus }],
        backend: {
          cucumber: fullBdd,
          jacoco: { line: 1, branch: 1, instruction: 1, complexity: 1, method: 1, clazz: 1 },
        },
        frontend: {
          cucumber: fullBdd,
          istanbul: { line: 1, statement: 1, function: 1, branch: 1 },
        },
      },
      state.config
    );
  }
);

When(
  "SDLC evaluates previously Done Issue {int} against a failing {string} scenario report",
  function (issueId: number, failingTag: string) {
    const state = getState(this);
    assert.ok(state.config);
    const reportJson = JSON.stringify([
      {
        tags: [{ name: failingTag }],
        elements: [{ type: "scenario", tags: [], steps: [{ result: { status: "failed" } }] }],
      },
    ]);
    const cucumberReport = parseCucumberJsonReport(reportJson, state.config);
    state.evaluation = evaluateSdlcState(
      {
        issueId,
        target: state.config.specs.fullstackTag as SpecTarget,
        specValid: true,
        hasLinkedBranch: true,
        hasImplementationCommits: true,
        isPreviouslyDone: true,
        isMerged: true,
        subIssues: [],
        backend: {
          cucumber: cucumberReport,
          jacoco: { line: 1, branch: 1, instruction: 1, complexity: 1, method: 1, clazz: 1 },
        },
        frontend: {
          cucumber: cucumberReport,
          istanbul: { line: 1, statement: 1, function: 1, branch: 1 },
        },
      },
      state.config
    );
  }
);

Then(
  "SDLC state machine status is {string} with merge allowed {string}",
  function (expectedStatus: string, expectedMergeAllowed: string) {
    const state = getState(this);
    assert.ok(state.evaluation);
    assert.equal(state.evaluation.status, expectedStatus);
    assert.equal(String(state.evaluation.canMerge), expectedMergeAllowed);
  }
);
