"use client";

import React, { useState, useMemo, useCallback } from "react";

export type JGitCommitCategory = "CLIENT" | "THERAPIST" | "CONFIDENTIAL";

export interface EnrichedGitCommit {
  commitHash: string;
  fullHash: string;
  message: string;
  author: string;
  authorInitials: string;
  timestamp: string;
  dateKey: string;
  formattedDate: string;
  formattedTime: string;
  snapshot: string;
  delta: string;
  category: JGitCommitCategory;
  moodScore: number | null;
  isShared: boolean | null;
}

export interface JGitHistoryTimelineProps {
  commits: any[];
  isTherapistView: boolean;
  splitView?: boolean;
  selectedCommitHash?: string | null;
  onSelectCommit?: (commitHash: string) => void;
  locale?: string;
}

function computeCommitDelta(currentSnapshot: string, parentSnapshot: string): string {
  const curr = (currentSnapshot || "").trim();
  const prev = (parentSnapshot || "").trim();

  if (!prev) {
    return curr;
  }
  if (curr === prev) {
    return "";
  }
  if (curr.startsWith(prev)) {
    return curr.slice(prev.length).trim();
  }

  const prevLines = new Set(prev.split("\n").map((l) => l.trim()));
  const addedLines = curr
    .split("\n")
    .filter((line) => !prevLines.has(line.trim()));

  return addedLines.join("\n").trim() || curr;
}

function computeLineComparison(targetSnapshot: string, baseSnapshot: string): {
  added: string[];
  removed: string[];
  unchangedCount: number;
} {
  const targetLines = (targetSnapshot || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const baseLines = (baseSnapshot || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const baseSet = new Set(baseLines);
  const targetSet = new Set(targetLines);

  const added = targetLines.filter((l) => !baseSet.has(l));
  const removed = baseLines.filter((l) => !targetSet.has(l));
  const unchangedCount = targetLines.filter((l) => baseSet.has(l)).length;

  return { added, removed, unchangedCount };
}

function classifyCommit(
  message: string,
  delta: string,
  author: string
): JGitCommitCategory {
  const msgLower = (message || "").toLowerCase();
  const deltaUpper = delta || "";

  if (
    deltaUpper.includes("INTERNAL_MEDICAL_NOTES") ||
    deltaUpper.includes("CONFIDENTIAL CLINICAL NOTE") ||
    msgLower.includes("clinical note") ||
    msgLower.includes("fortrolig")
  ) {
    return "CONFIDENTIAL";
  }

  if (
    msgLower.includes("terapeut") ||
    msgLower.includes("opfølgning") ||
    deltaUpper.includes("Terapeutisk opfølgning") ||
    author.toLowerCase().includes("dr.") ||
    author.toLowerCase().includes("psykolog")
  ) {
    return "THERAPIST";
  }

  return "CLIENT";
}

function parseCommitMetadata(delta: string, snapshot: string): {
  moodScore: number | null;
  isShared: boolean | null;
} {
  const source = `${delta}\n${snapshot}`;
  let moodScore: number | null = null;
  let isShared: boolean | null = null;

  const moodMatch = source.match(/(?:Mood|Humør)\s*:\s*(\d{1,2})\s*\/\s*10/i);
  if (moodMatch) {
    const parsed = parseInt(moodMatch[1], 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 10) {
      moodScore = parsed;
    }
  }

  const sharedMatch = source.match(/Shared\s*:\s*(true|false)/i);
  if (sharedMatch) {
    isShared = sharedMatch[1].toLowerCase() === "true";
  } else if (source.toLowerCase().includes("delt med terapeut")) {
    isShared = true;
  } else if (source.toLowerCase().includes("privat")) {
    isShared = false;
  }

  return { moodScore, isShared };
}

function computeInitials(author: string): string {
  const clean = (author || "Ukendt")
    .replace(/^dr\.?\s+/i, "")
    .trim();
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || "UK";
}

function highlightText(text: string, query: string): React.ReactNode {
  const q = (query || "").trim();
  if (!q || !text) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  if (parts.length <= 1) return text;
  return parts.map((part, idx) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={idx} className="jgit-search-mark">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export default function JGitHistoryTimeline({
  commits,
  isTherapistView,
  splitView = false,
  selectedCommitHash,
  onSelectCommit,
  locale = "da",
}: JGitHistoryTimelineProps) {
  const [activeFilter, setActiveFilter] = useState<
    "ALL" | "CLIENT" | "THERAPIST" | "CONFIDENTIAL"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"DELTA" | "SNAPSHOT">("DELTA");
  const [showClinicalFormatted, setShowClinicalFormatted] = useState(true);
  const [compareCommitHash, setCompareCommitHash] = useState<string | null>(null);
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});
  const [internalSelectedHash, setInternalSelectedHash] = useState<string | null>(
    selectedCommitHash || null
  );
  const [prevPropHash, setPrevPropHash] = useState<string | null | undefined>(
    selectedCommitHash
  );

  if (selectedCommitHash !== prevPropHash) {
    setPrevPropHash(selectedCommitHash);
    if (selectedCommitHash) {
      setInternalSelectedHash(selectedCommitHash);
    }
  }

  // 1. Enrich commits with parent diff (delta), category, mood/shared chips, and localized date/time
  const enrichedCommits = useMemo<EnrichedGitCommit[]>(() => {
    if (!Array.isArray(commits) || commits.length === 0) return [];

    const list: EnrichedGitCommit[] = [];
    for (let i = 0; i < commits.length; i++) {
      const c = commits[i];
      const parent = commits[i + 1];
      const rawDelta = computeCommitDelta(c.snapshot || "", parent?.snapshot || "");
      const category = classifyCommit(c.message || "", rawDelta, c.author || "");

      // Strict client privacy: never show commits that only added INTERNAL_MEDICAL_NOTES
      if (!isTherapistView && (category === "CONFIDENTIAL" || !rawDelta)) {
        continue;
      }

      let dateObj = new Date();
      if (c.timestamp) {
        const parsed = new Date(c.timestamp);
        if (!isNaN(parsed.getTime())) {
          dateObj = parsed;
        }
      }

      const dateKey = dateObj.toISOString().slice(0, 10);
      const formattedDate = new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(dateObj);
      const formattedTime = new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(dateObj);

      const authorStr = c.author || "Ukendt";
      const deltaStr = rawDelta || c.snapshot || "";
      const { moodScore, isShared } = parseCommitMetadata(deltaStr, c.snapshot || "");

      list.push({
        commitHash: c.commitHash || String(c.fullHash || "").slice(0, 8),
        fullHash: c.fullHash || c.commitHash || "",
        message: c.message || "Journal revision",
        author: authorStr,
        authorInitials: computeInitials(authorStr),
        timestamp: c.timestamp || "",
        dateKey,
        formattedDate,
        formattedTime,
        snapshot: c.snapshot || "",
        delta: deltaStr,
        category,
        moodScore,
        isShared,
      });
    }
    return list;
  }, [commits, isTherapistView, locale]);

  const effectiveSelectedHash = useMemo(() => {
    if (enrichedCommits.length === 0) return null;
    if (internalSelectedHash === "__COLLAPSED__") return null;
    if (
      internalSelectedHash &&
      enrichedCommits.some((c) => c.commitHash === internalSelectedHash)
    ) {
      return internalSelectedHash;
    }
    return enrichedCommits[0].commitHash;
  }, [enrichedCommits, internalSelectedHash]);

  // 2. Apply category filter & search query
  const filteredCommits = useMemo(() => {
    return enrichedCommits.filter((c) => {
      if (activeFilter !== "ALL" && c.category !== activeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const haystack = `${c.commitHash} ${c.fullHash} ${c.message} ${c.author} ${c.delta} ${c.snapshot} ${c.formattedDate}`.toLowerCase();
        if (!haystack.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [enrichedCommits, activeFilter, searchQuery]);

  // 3. Group filtered commits by calendar date (Date-first grouping)
  const dateGroups = useMemo(() => {
    const groups: Array<{
      dateKey: string;
      formattedDate: string;
      items: EnrichedGitCommit[];
    }> = [];
    const map = new Map<string, EnrichedGitCommit[]>();

    for (const c of filteredCommits) {
      let arr = map.get(c.dateKey);
      if (!arr) {
        arr = [];
        map.set(c.dateKey, arr);
        groups.push({
          dateKey: c.dateKey,
          formattedDate: c.formattedDate,
          items: arr,
        });
      }
      arr.push(c);
    }
    return groups;
  }, [filteredCommits]);

  const activeCommitIndex = useMemo(() => {
    if (filteredCommits.length === 0) return -1;
    if (!effectiveSelectedHash) return 0;
    const idx = filteredCommits.findIndex(
      (c) => c.commitHash === effectiveSelectedHash
    );
    return idx >= 0 ? idx : 0;
  }, [filteredCommits, effectiveSelectedHash]);

  const activeCommit = useMemo(
    () => (activeCommitIndex >= 0 ? filteredCommits[activeCommitIndex] : null),
    [filteredCommits, activeCommitIndex]
  );

  const compareBaseCommit = useMemo(
    () =>
      compareCommitHash
        ? enrichedCommits.find((c) => c.commitHash === compareCommitHash) || null
        : null,
    [enrichedCommits, compareCommitHash]
  );

  const selectCommitAndNotify = useCallback(
    (hash: string) => {
      setInternalSelectedHash(hash);
      if (onSelectCommit) {
        onSelectCommit(hash);
      }
    },
    [onSelectCommit]
  );

  const handleCommitClick = (hash: string) => {
    if (!splitView && effectiveSelectedHash === hash) {
      setInternalSelectedHash("__COLLAPSED__");
      return;
    }
    selectCommitAndNotify(hash);
  };

  const navigateRelativeCommit = useCallback(
    (direction: -1 | 1) => {
      if (filteredCommits.length === 0) return;
      const nextIdx = activeCommitIndex + direction;
      if (nextIdx >= 0 && nextIdx < filteredCommits.length) {
        const target = filteredCommits[nextIdx];
        // Ensure target's date group is expanded
        setCollapsedDates((prev) => ({ ...prev, [target.dateKey]: false }));
        selectCommitAndNotify(target.commitHash);
      }
    },
    [filteredCommits, activeCommitIndex, selectCommitAndNotify]
  );

  const toggleDateCollapse = (dateKey: string) => {
    setCollapsedDates((prev) => ({
      ...prev,
      [dateKey]: !prev[dateKey],
    }));
  };

  const jumpToDateGroup = (dateKey: string, firstCommitHash?: string) => {
    setCollapsedDates((prev) => ({ ...prev, [dateKey]: false }));
    if (firstCommitHash) {
      selectCommitAndNotify(firstCommitHash);
    }
  };

  const getCategoryMeta = (cat: JGitCommitCategory) => {
    switch (cat) {
      case "CONFIDENTIAL":
        return {
          label: "Fortroligt notat",
          colorHex: "#d97706",
          bgHex: "#fffbeb",
          borderHex: "#fde68a",
          textHex: "#92400e",
          cardClass: "cat-confidential",
          nodeClass: "node-confidential",
          icon: "bi-shield-lock-fill",
          trackIndex: 2,
        };
      case "THERAPIST":
        return {
          label: "Terapeut-notat",
          colorHex: "#4f46e5",
          bgHex: "#eef2ff",
          borderHex: "#c7d2fe",
          textHex: "#3730a3",
          cardClass: "cat-therapist",
          nodeClass: "node-therapist",
          icon: "bi-heart-pulse-fill",
          trackIndex: 1,
        };
      default:
        return {
          label: "Klient-indlæg",
          colorHex: "#059669",
          bgHex: "#ecfdf5",
          borderHex: "#a7f3d0",
          textHex: "#065f46",
          cardClass: "cat-client",
          nodeClass: "node-client",
          icon: "bi-journal-bookmark-fill",
          trackIndex: 0,
        };
    }
  };

  const getMoodBadgeStyle = (score: number) => {
    if (score >= 7) {
      return {
        bg: "#dcfce7",
        border: "#86efac",
        text: "#166534",
        emoji: "😊",
      };
    }
    if (score >= 4) {
      return {
        bg: "#fef9c3",
        border: "#fde047",
        text: "#854d0e",
        emoji: "😐",
      };
    }
    return {
      bg: "#ffe4e6",
      border: "#fda4af",
      text: "#9f1239",
      emoji: "🌧️",
    };
  };

  // Counts & statistics for Time-Travel Header Bar
  const clientCount = useMemo(
    () => enrichedCommits.filter((c) => c.category === "CLIENT").length,
    [enrichedCommits]
  );
  const therapistCount = useMemo(
    () => enrichedCommits.filter((c) => c.category === "THERAPIST").length,
    [enrichedCommits]
  );
  const confidentialCount = useMemo(
    () => enrichedCommits.filter((c) => c.category === "CONFIDENTIAL").length,
    [enrichedCommits]
  );
  const moodCommits = useMemo(
    () =>
      enrichedCommits
        .filter((c) => c.moodScore !== null)
        .slice()
        .reverse(),
    [enrichedCommits]
  );

  // Render the Multi-Track Swimlane Gutter for a commit
  const renderSwimlaneGutter = (commit: EnrichedGitCommit, isSelected: boolean) => {
    const meta = getCategoryMeta(commit.category);
    const totalLanes = isTherapistView ? 3 : 2;
    // Connector width from active lane to card edge
    const connectorWidths = isTherapistView
      ? ["34px", "20px", "6px"]
      : ["22px", "8px", "8px"];

    return (
      <div
        className="jgit-swimlane-gutter"
        style={{ width: isTherapistView ? "46px" : "32px" }}
        title={`JGit Branch: ${meta.label}`}
      >
        {/* Lane 0: Client Branch (Emerald) */}
        <div className="jgit-swimlane-rail rail-client">
          {meta.trackIndex === 0 && (
            <span
              className={`jgit-timeline-dot jgit-swimlane-node node-client ${
                isSelected ? "node-active" : ""
              }`}
            />
          )}
        </div>

        {/* Lane 1: Shared Therapist Branch (Indigo) */}
        <div className="jgit-swimlane-rail rail-therapist">
          {meta.trackIndex === 1 && (
            <span
              className={`jgit-timeline-dot jgit-swimlane-node node-therapist ${
                isSelected ? "node-active" : ""
              }`}
            />
          )}
        </div>

        {/* Lane 2: Confidential Clinical Branch (Amber - Therapist Only) */}
        {totalLanes === 3 && (
          <div className="jgit-swimlane-rail rail-confidential">
            {meta.trackIndex === 2 && (
              <span
                className={`jgit-timeline-dot jgit-swimlane-node node-confidential ${
                  isSelected ? "node-active" : ""
                }`}
              />
            )}
          </div>
        )}

        {/* Horizontal Branch Connector Line into Commit Card */}
        <span
          className="jgit-branch-connector"
          style={{
            width: connectorWidths[meta.trackIndex] || "12px",
            backgroundColor: meta.colorHex,
            opacity: isSelected ? 0.95 : 0.45,
          }}
        />
      </div>
    );
  };

  // Render Commit Card Metadata Chips (Author Avatar, Mood Score, Shared/Private)
  const renderCommitChips = (commit: EnrichedGitCommit, compact = false) => {
    const meta = getCategoryMeta(commit.category);
    return (
      <div className="d-flex flex-wrap align-items-center gap-1.5 mt-1.5">
        {/* Author Avatar + Name */}
        <span
          className="d-inline-flex align-items-center gap-1 rounded-pill px-2 py-0.5 border"
          style={{
            backgroundColor: meta.bgHex,
            borderColor: meta.borderHex,
            color: meta.textHex,
            fontSize: compact ? "0.68rem" : "0.71rem",
            fontWeight: 600,
          }}
        >
          <span
            className="d-inline-flex align-items-center justify-content-center rounded-circle text-white fw-bold"
            style={{
              width: "16px",
              height: "16px",
              fontSize: "0.58rem",
              backgroundColor: meta.colorHex,
            }}
          >
            {commit.authorInitials}
          </span>
          <span>Af {highlightText(commit.author, searchQuery)}</span>
        </span>

        {/* Mood Chip (if present in commit) */}
        {commit.moodScore !== null && (() => {
          const mStyle = getMoodBadgeStyle(commit.moodScore);
          return (
            <span
              className="d-inline-flex align-items-center gap-1 rounded-pill px-2 py-0.5 border fw-semibold"
              style={{
                backgroundColor: mStyle.bg,
                borderColor: mStyle.border,
                color: mStyle.text,
                fontSize: compact ? "0.68rem" : "0.71rem",
              }}
            >
              <span>{mStyle.emoji}</span>
              <span>Humør {commit.moodScore}/10</span>
            </span>
          );
        })()}

        {/* Shared / Private / Confidential Chip */}
        {commit.category === "CONFIDENTIAL" ? (
          <span
            className="d-inline-flex align-items-center gap-1 rounded-pill px-2 py-0.5 border fw-semibold"
            style={{
              backgroundColor: "#fef3c7",
              borderColor: "#fcd34d",
              color: "#92400e",
              fontSize: compact ? "0.68rem" : "0.71rem",
            }}
          >
            <i className="bi bi-lock-fill"></i>
            <span>Kun terapeuter</span>
          </span>
        ) : commit.isShared !== null ? (
          <span
            className="d-inline-flex align-items-center gap-1 rounded-pill px-2 py-0.5 border fw-medium"
            style={{
              backgroundColor: commit.isShared ? "#e0f2fe" : "#f1f5f9",
              borderColor: commit.isShared ? "#bae6fd" : "#cbd5e1",
              color: commit.isShared ? "#0369a1" : "#475569",
              fontSize: compact ? "0.68rem" : "0.71rem",
            }}
          >
            <i
              className={`bi ${
                commit.isShared ? "bi-share-fill" : "bi-eye-slash-fill"
              }`}
            ></i>
            <span>{commit.isShared ? "Delt" : "Privat"}</span>
          </span>
        ) : null}
      </div>
    );
  };

  // Render Structured Clinical Card inside Inspector
  const renderClinicalFormattedCard = (commit: EnrichedGitCommit) => {
    const meta = getCategoryMeta(commit.category);
    const sourceText = viewMode === "DELTA" ? commit.delta : commit.snapshot;
    const rawLines = (sourceText || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    // Filter out raw technical metadata lines if already shown in badges
    const bodyLines = rawLines.filter(
      (l) => !/^Mood\s*:\s*\d+/i.test(l)
    );

    return (
      <div
        className="p-3 rounded-3 border mb-2.5 shadow-xs"
        style={{
          background: `linear-gradient(135deg, #ffffff 0%, ${meta.bgHex} 100%)`,
          borderColor: meta.borderHex,
          borderLeft: `4px solid ${meta.colorHex}`,
        }}
      >
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2 pb-1.5 border-bottom">
          <div className="d-flex align-items-center gap-2">
            <span
              className="d-inline-flex align-items-center justify-content-center rounded-circle text-white"
              style={{
                width: "26px",
                height: "26px",
                backgroundColor: meta.colorHex,
                fontSize: "0.78rem",
              }}
            >
              <i className={`bi ${meta.icon}`}></i>
            </span>
            <div>
              <div className="fw-bold text-dark" style={{ fontSize: "0.84rem" }}>
                {highlightText(commit.message, searchQuery)}
              </div>
              <div className="text-muted" style={{ fontSize: "0.71rem" }}>
                Klinisk Læse-visning • {commit.formattedDate} kl. {commit.formattedTime}
              </div>
            </div>
          </div>
          {renderCommitChips(commit, true)}
        </div>

        <div className="d-flex flex-column gap-1.5" style={{ fontSize: "0.82rem" }}>
          {bodyLines.length === 0 ? (
            <div className="text-muted fst-italic small">
              Ingen yderligere brødtekst i denne revision.
            </div>
          ) : (
            bodyLines.map((line, idx) => {
              const isHeading = line.startsWith("#");
              const cleanLine = line.replace(/^#+\s*/, "");
              if (isHeading) {
                return (
                  <div
                    key={idx}
                    className="fw-bold text-dark mt-1"
                    style={{ fontSize: "0.86rem", color: meta.textHex }}
                  >
                    {highlightText(cleanLine, searchQuery)}
                  </div>
                );
              }
              return (
                <div key={idx} className="text-dark" style={{ lineHeight: 1.5 }}>
                  {highlightText(line, searchQuery)}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  // Render Interactive Commit Inspector (Navigation, Compare Mode, Clinical Card + Git Diff/Snapshot)
  const renderCommitInspector = (commit: EnrichedGitCommit) => {
    const meta = getCategoryMeta(commit.category);
    const deltaLines = (commit.delta || "")
      .split("\n")
      .filter((line) => line.trim() !== "");

    const hasNewer = activeCommitIndex > 0;
    const hasOlder =
      activeCommitIndex >= 0 && activeCommitIndex < filteredCommits.length - 1;

    const comparisonResult =
      compareBaseCommit && compareBaseCommit.commitHash !== commit.commitHash
        ? computeLineComparison(commit.snapshot, compareBaseCommit.snapshot)
        : null;

    return (
      <div
        className="p-3 rounded-4 border mt-2 shadow-xs"
        style={{
          backgroundColor: "#f8fafc",
          borderColor: meta.borderHex,
        }}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
            e.preventDefault();
            navigateRelativeCommit(-1);
          } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
            e.preventDefault();
            navigateRelativeCommit(1);
          }
        }}
      >
        {/* Top Inspector Bar: Prev/Next Navigation + Compare Selector */}
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2.5 pb-2 border-bottom">
          <div className="d-flex align-items-center gap-1.5">
            <div className="btn-group btn-group-sm" role="group" aria-label="Commit navigation">
              <button
                type="button"
                disabled={!hasNewer}
                onClick={(e) => {
                  e.stopPropagation();
                  navigateRelativeCommit(-1);
                }}
                className="btn btn-outline-secondary bg-white"
                style={{ fontSize: "0.72rem" }}
                title="Nyere revision (Pil op)"
              >
                <i className="bi bi-arrow-up-short"></i> Nyere
              </button>
              <button
                type="button"
                disabled={!hasOlder}
                onClick={(e) => {
                  e.stopPropagation();
                  navigateRelativeCommit(1);
                }}
                className="btn btn-outline-secondary bg-white"
                style={{ fontSize: "0.72rem" }}
                title="Ældre revision (Pil ned)"
              >
                Ældre <i className="bi bi-arrow-down-short"></i>
              </button>
            </div>

            <span
              className="badge rounded-pill border text-dark bg-white"
              style={{ fontSize: "0.7rem" }}
            >
              Revision {activeCommitIndex + 1} af {filteredCommits.length}
            </span>
          </div>

          {/* Interactive Compare-Mode Selector */}
          <div
            className="d-flex align-items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <i className="bi bi-intersect text-primary" style={{ fontSize: "0.78rem" }}></i>
            <select
              className="form-select form-select-sm bg-white"
              style={{ fontSize: "0.72rem", maxWidth: "220px", paddingBlock: "0.18rem" }}
              value={compareCommitHash || ""}
              onChange={(e) => setCompareCommitHash(e.target.value || null)}
              aria-label="Sammenlign med en anden revision"
            >
              <option value="">Sammenlign med forrige (Standard)</option>
              {enrichedCommits
                .filter((c) => c.commitHash !== commit.commitHash)
                .map((c) => (
                  <option key={c.commitHash} value={c.commitHash}>
                    vs. #{c.commitHash} ({c.formattedDate} kl. {c.formattedTime})
                  </option>
                ))}
            </select>
            {compareCommitHash && (
              <button
                type="button"
                onClick={() => setCompareCommitHash(null)}
                className="btn btn-sm btn-outline-danger py-0 px-1.5"
                style={{ fontSize: "0.68rem" }}
                title="Nulstil sammenligning"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Toggle Bar: Delta/Diff (Default) vs Full Snapshot + Clinical Reader Switch */}
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2.5">
          <div className="small text-muted d-flex flex-wrap align-items-center gap-1.5">
            <span
              className="font-monospace fw-bold px-2 py-0.5 rounded text-white"
              style={{ backgroundColor: meta.colorHex, fontSize: "0.74rem" }}
            >
              #{commit.commitHash}
            </span>
            <span>•</span>
            <strong>{highlightText(commit.author, searchQuery)}</strong>
            <span>• kl. {commit.formattedTime}</span>
          </div>

          <div className="d-flex flex-wrap align-items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowClinicalFormatted((prev) => !prev);
              }}
              className={`btn btn-sm rounded-pill px-2.5 py-0.5 ${
                showClinicalFormatted
                  ? "btn-success text-white fw-semibold"
                  : "btn-outline-secondary bg-white"
              }`}
              style={{ fontSize: "0.71rem" }}
              title="Vis formateret klinisk læsekort over kode-diffen"
            >
              <i className="bi bi-card-heading me-1"></i>
              Klinisk Kort
            </button>

            <div className="btn-group btn-group-sm" role="group">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewMode("DELTA");
                }}
                className={`btn ${
                  viewMode === "DELTA"
                    ? "btn-dark fw-semibold"
                    : "btn-outline-secondary bg-white"
                }`}
                style={{ fontSize: "0.73rem" }}
              >
                <i className="bi bi-file-earmark-diff me-1"></i>
                Ændring i dette commit (Diff)
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewMode("SNAPSHOT");
                }}
                className={`btn ${
                  viewMode === "SNAPSHOT"
                    ? "btn-dark fw-semibold"
                    : "btn-outline-secondary bg-white"
                }`}
                style={{ fontSize: "0.73rem" }}
              >
                <i className="bi bi-file-earmark-text me-1"></i>
                Fuld Journal-Snapshot
              </button>
            </div>
          </div>
        </div>

        {/* Compare-Mode Banner when comparing two specific revisions */}
        {comparisonResult && compareBaseCommit && (
          <div
            className="p-2.5 rounded-3 mb-2.5 border"
            style={{
              backgroundColor: "#fdf2f8",
              borderColor: "#fbcfe8",
              fontSize: "0.76rem",
            }}
          >
            <div className="d-flex justify-content-between align-items-center mb-1.5">
              <span className="fw-bold" style={{ color: "#9d174d" }}>
                <i className="bi bi-arrow-left-right me-1"></i>
                Sammenligning: #{compareBaseCommit.commitHash} ({compareBaseCommit.formattedDate}) → #{commit.commitHash} ({commit.formattedDate})
              </span>
              <span className="badge bg-white text-dark border">
                +{comparisonResult.added.length} tilføjet / -{comparisonResult.removed.length} fjernet
              </span>
            </div>
            <div className="jgit-diff-box py-2 px-2.5">
              {comparisonResult.added.length === 0 &&
              comparisonResult.removed.length === 0 ? (
                <div className="text-muted fst-italic">
                  Ingen tekstforskel mellem de to valgte revisioner.
                </div>
              ) : (
                <>
                  {comparisonResult.removed.map((line, idx) => (
                    <span key={`rem-${idx}`} className="jgit-diff-line-remove">
                      - {highlightText(line, searchQuery)}
                    </span>
                  ))}
                  {comparisonResult.added.map((line, idx) => (
                    <span key={`add-${idx}`} className="jgit-diff-line-add">
                      + {highlightText(line, searchQuery)}
                    </span>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* Formatted Clinical Reader Card */}
        {showClinicalFormatted && renderClinicalFormattedCard(commit)}

        {/* Raw JGit Diff / Snapshot Box (Always preserves BDD test selectors & text) */}
        {viewMode === "DELTA" ? (
          <div className="jgit-diff-box">
            <div className="text-secondary mb-2 d-flex justify-content-between align-items-center" style={{ fontSize: "0.7rem" }}>
              <span>
                @@ Tilføjet i commit #{commit.commitHash} ({commit.formattedDate} kl.{" "}
                {commit.formattedTime}) @@
              </span>
              <span className="badge bg-success bg-opacity-25 text-success border border-success border-opacity-25">
                +{deltaLines.length} linjer
              </span>
            </div>
            {deltaLines.length === 0 ? (
              <div className="text-muted fst-italic">
                Ingen tekstændring i denne revision.
              </div>
            ) : (
              deltaLines.map((line, idx) => (
                <span key={idx} className="jgit-diff-line-add">
                  + {highlightText(line, searchQuery)}
                </span>
              ))
            )}
          </div>
        ) : (
          <div className="jgit-diff-box">
            <div className="text-secondary mb-2" style={{ fontSize: "0.7rem" }}>
              Fuld journaltilstand ved commit #{commit.commitHash} (
              {commit.formattedDate} kl. {commit.formattedTime})
            </div>
            <div>{highlightText(commit.snapshot || "Tomt dokument.", searchQuery)}</div>
          </div>
        )}
      </div>
    );
  };

  const totalCount = Math.max(enrichedCommits.length, 1);
  const clientPct = Math.round((clientCount / totalCount) * 100);
  const therapistPct = Math.round((therapistCount / totalCount) * 100);
  const confidentialPct = Math.max(0, 100 - clientPct - therapistPct);

  return (
    <div className="d-flex flex-column gap-3">
      {/* 1. Interactive Time-Travel & Mini-Statistics Header Bar */}
      {enrichedCommits.length > 0 && (
        <div
          className="p-3 rounded-4 border shadow-xs"
          style={{
            background:
              "linear-gradient(135deg, #f0fdf4 0%, #eef2ff 52%, #fffbeb 100%)",
            borderColor: "#cbd5e1",
          }}
        >
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
            {/* Branch Legend & Distribution */}
            <div className="d-flex flex-wrap align-items-center gap-2">
              <span
                className="badge rounded-pill px-2.5 py-1 d-inline-flex align-items-center gap-1"
                style={{
                  backgroundColor: "#059669",
                  color: "#ffffff",
                  fontSize: "0.71rem",
                }}
              >
                <i className="bi bi-diagram-3-fill"></i>
                JGit Branch-Graf
              </span>
              <span
                className="d-inline-flex align-items-center gap-1 small fw-semibold"
                style={{ color: "#065f46", fontSize: "0.74rem" }}
              >
                <span
                  className="rounded-circle d-inline-block"
                  style={{ width: 9, height: 9, backgroundColor: "#10b981" }}
                />
                Klient-spor ({clientCount})
              </span>
              <span
                className="d-inline-flex align-items-center gap-1 small fw-semibold"
                style={{ color: "#3730a3", fontSize: "0.74rem" }}
              >
                <span
                  className="rounded-circle d-inline-block"
                  style={{ width: 9, height: 9, backgroundColor: "#6366f1" }}
                />
                Terapeut-spor ({therapistCount})
              </span>
              {isTherapistView && (
                <span
                  className="d-inline-flex align-items-center gap-1 small fw-semibold"
                  style={{ color: "#92400e", fontSize: "0.74rem" }}
                >
                  <span
                    className="rounded-circle d-inline-block"
                    style={{ width: 9, height: 9, backgroundColor: "#f59e0b" }}
                  />
                  Fortroligt spor ({confidentialCount})
                </span>
              )}
            </div>

            {/* Mini Mood Trend Curve over Revisions */}
            {moodCommits.length > 0 && (
              <div className="d-flex align-items-center gap-1.5 bg-white bg-opacity-75 px-2.5 py-1 rounded-pill border">
                <span
                  className="text-muted fw-semibold"
                  style={{ fontSize: "0.68rem" }}
                >
                  Humør-udvikling:
                </span>
                <div className="d-flex align-items-end gap-1" style={{ height: "18px" }}>
                  {moodCommits.slice(-8).map((mc) => {
                    const score = mc.moodScore || 5;
                    const barHeight = Math.max(5, Math.round((score / 10) * 18));
                    const mStyle = getMoodBadgeStyle(score);
                    const isSelected = activeCommit?.commitHash === mc.commitHash;
                    return (
                      <button
                        key={mc.commitHash}
                        type="button"
                        onClick={() => selectCommitAndNotify(mc.commitHash)}
                        className="border-0 p-0 rounded-1"
                        style={{
                          width: isSelected ? "10px" : "7px",
                          height: `${barHeight}px`,
                          backgroundColor: mStyle.text,
                          opacity: isSelected ? 1 : 0.65,
                          transition: "all 0.15s ease",
                        }}
                        title={`#${mc.commitHash} (${mc.formattedDate}): Humør ${score}/10`}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Multi-Color Proportion Bar */}
          <div
            className="d-flex rounded-pill overflow-hidden mb-2"
            style={{ height: "6px", backgroundColor: "#e2e8f0" }}
          >
            {clientCount > 0 && (
              <div
                style={{
                  width: `${clientPct}%`,
                  backgroundColor: "#10b981",
                }}
                title={`Klient-indlæg: ${clientCount}`}
              />
            )}
            {therapistCount > 0 && (
              <div
                style={{
                  width: `${therapistPct}%`,
                  backgroundColor: "#6366f1",
                }}
                title={`Terapeut-noter: ${therapistCount}`}
              />
            )}
            {isTherapistView && confidentialCount > 0 && (
              <div
                style={{
                  width: `${confidentialPct}%`,
                  backgroundColor: "#f59e0b",
                }}
                title={`Fortrolige noter: ${confidentialCount}`}
              />
            )}
          </div>

          {/* Quick Date-Jump Pills */}
          {dateGroups.length > 0 && (
            <div className="d-flex flex-wrap align-items-center gap-1.5">
              <span
                className="text-secondary fw-semibold me-1"
                style={{ fontSize: "0.7rem" }}
              >
                <i className="bi bi-clock-history me-1"></i>Tidsrejse:
              </span>
              {dateGroups.map((grp) => {
                const isActiveDate = activeCommit?.dateKey === grp.dateKey;
                return (
                  <button
                    key={grp.dateKey}
                    type="button"
                    onClick={() =>
                      jumpToDateGroup(grp.dateKey, grp.items[0]?.commitHash)
                    }
                    className={`btn btn-sm rounded-pill py-0 px-2 ${
                      isActiveDate
                        ? "btn-dark text-white fw-semibold"
                        : "btn-light bg-white text-secondary border"
                    }`}
                    style={{ fontSize: "0.69rem" }}
                  >
                    {grp.formattedDate} ({grp.items.length})
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. Top Filter Pills + Search Input with Clear Button */}
      <div className="d-flex flex-column gap-2 p-2.5 rounded-4 bg-white border shadow-xs">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div className="d-flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setActiveFilter("ALL")}
              className={`btn btn-sm rounded-pill px-3 py-1 ${
                activeFilter === "ALL"
                  ? "btn-dark fw-semibold shadow-xs"
                  : "btn-outline-secondary bg-light"
              }`}
              style={{ fontSize: "0.74rem" }}
            >
              Alle ({enrichedCommits.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("CLIENT")}
              className="btn btn-sm rounded-pill px-3 py-1 fw-semibold"
              style={{
                fontSize: "0.74rem",
                backgroundColor:
                  activeFilter === "CLIENT" ? "#059669" : "#ecfdf5",
                color: activeFilter === "CLIENT" ? "#ffffff" : "#065f46",
                borderColor: "#10b981",
              }}
            >
              <i className="bi bi-journal-bookmark-fill me-1"></i>
              Klient-indlæg ({clientCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("THERAPIST")}
              className="btn btn-sm rounded-pill px-3 py-1 fw-semibold"
              style={{
                fontSize: "0.74rem",
                backgroundColor:
                  activeFilter === "THERAPIST" ? "#4f46e5" : "#eef2ff",
                color: activeFilter === "THERAPIST" ? "#ffffff" : "#3730a3",
                borderColor: "#6366f1",
              }}
            >
              <i className="bi bi-heart-pulse-fill me-1"></i>
              Terapeut-noter ({therapistCount})
            </button>
            {isTherapistView && (
              <button
                type="button"
                onClick={() => setActiveFilter("CONFIDENTIAL")}
                className="btn btn-sm rounded-pill px-3 py-1 fw-semibold"
                style={{
                  fontSize: "0.74rem",
                  backgroundColor:
                    activeFilter === "CONFIDENTIAL" ? "#d97706" : "#fffbeb",
                  color: activeFilter === "CONFIDENTIAL" ? "#ffffff" : "#92400e",
                  borderColor: "#f59e0b",
                }}
              >
                <i className="bi bi-shield-lock-fill me-1"></i>
                Fortrolige noter ({confidentialCount})
              </button>
            )}
          </div>

          <div
            className="position-relative flex-grow-1"
            style={{ maxWidth: "280px" }}
          >
            <input
              type="text"
              className="form-control form-control-sm bg-light rounded-pill ps-3 pe-4"
              placeholder="Søg i indhold, forfatter, #SHA..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="btn btn-sm btn-link text-secondary position-absolute top-50 end-0 translate-middle-y pe-2 text-decoration-none"
                title="Ryd søgning"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Empty State or Timeline Layout */}
      {dateGroups.length === 0 ? (
        <div className="p-4 rounded-4 border bg-light text-center text-muted small">
          <i className="bi bi-git fs-4 d-block mb-1 text-secondary"></i>
          Ingen JGit-commits matcher det valgte filter.
        </div>
      ) : splitView ? (
        /* 2-COLUMN SPLIT-VIEW (Maximized Window or Drawer View) */
        <div className="row g-3">
          <div
            className="col-md-5 border-end pe-md-3 overflow-auto"
            style={{ maxHeight: "560px" }}
          >
            <div className="jgit-timeline-track">
              {dateGroups.map((group) => {
                const isDateCollapsed = Boolean(collapsedDates[group.dateKey]);
                return (
                  <div key={group.dateKey} className="mb-3" data-date={group.dateKey}>
                    <div
                      className="jgit-date-group-header"
                      onClick={() => toggleDateCollapse(group.dateKey)}
                      title="Klik for at folde datoen sammen/ud"
                    >
                      <div className="d-flex align-items-center gap-2">
                        <i className="bi bi-calendar3 text-teal"></i>
                        <span>{group.formattedDate}</span>
                        <span className="badge bg-dark bg-opacity-10 text-dark rounded-pill fw-semibold">
                          {group.items.length}
                        </span>
                      </div>
                      <i
                        className={`bi ${
                          isDateCollapsed ? "bi-chevron-right" : "bi-chevron-down"
                        } small text-secondary`}
                      ></i>
                    </div>

                    {!isDateCollapsed &&
                      group.items.map((c) => {
                        const isSelected = activeCommit?.commitHash === c.commitHash;
                        const isCompareBase =
                          compareCommitHash === c.commitHash;
                        const meta = getCategoryMeta(c.category);

                        return (
                          <div
                            key={c.fullHash || c.commitHash}
                            className="jgit-commit-item"
                            data-commit-hash={c.commitHash}
                            data-category={c.category}
                          >
                            {renderSwimlaneGutter(c, isSelected)}

                            <div
                              onClick={() => handleCommitClick(c.commitHash)}
                              className={`jgit-commit-card ${meta.cardClass} p-2.5 ${
                                isSelected ? "active" : ""
                              } ${isCompareBase ? "compare-target" : ""}`}
                            >
                              <div className="d-flex justify-content-between align-items-center gap-2 mb-1">
                                <div className="d-flex align-items-center gap-1.5">
                                  <span
                                    className="font-monospace small fw-bold px-1.5 py-0.5 rounded"
                                    style={{
                                      backgroundColor: meta.bgHex,
                                      color: meta.textHex,
                                      border: `1px solid ${meta.borderHex}`,
                                      fontSize: "0.72rem",
                                    }}
                                  >
                                    #{highlightText(c.commitHash, searchQuery)}
                                  </span>
                                  <span
                                    className="badge rounded-pill"
                                    style={{
                                      backgroundColor: meta.colorHex,
                                      color: "#ffffff",
                                      fontSize: "0.66rem",
                                    }}
                                  >
                                    <i className={`bi ${meta.icon} me-1`}></i>
                                    {meta.label}
                                  </span>
                                </div>
                                <span
                                  className="text-muted fw-medium"
                                  style={{ fontSize: "0.7rem" }}
                                >
                                  {c.formattedTime}
                                </span>
                              </div>

                              <div className="small fw-bold text-dark text-truncate">
                                {highlightText(c.message, searchQuery)}
                              </div>

                              {renderCommitChips(c, true)}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="col-md-7">
            {activeCommit ? (
              <div>
                { (() => {
                  const activeMeta = getCategoryMeta(activeCommit.category);
                  return (
                    <div
                      className="p-3 rounded-4 border mb-2 d-flex justify-content-between align-items-start gap-2"
                      style={{
                        background: `linear-gradient(135deg, ${activeMeta.bgHex} 0%, #ffffff 100%)`,
                        borderColor: activeMeta.borderHex,
                      }}
                    >
                      <div>
                        <div className="d-flex flex-wrap align-items-center gap-1.5 mb-1">
                          <span
                            className="badge rounded-pill"
                            style={{
                              backgroundColor: activeMeta.colorHex,
                              color: "#ffffff",
                            }}
                          >
                            <i className={`bi ${activeMeta.icon} me-1`}></i>
                            {activeMeta.label}
                          </span>
                          <span className="badge bg-white text-secondary border">
                            {activeCommit.formattedDate} kl. {activeCommit.formattedTime}
                          </span>
                        </div>
                        <h6 className="fw-bold text-dark mb-0">
                          {highlightText(activeCommit.message, searchQuery)}
                        </h6>
                      </div>
                      <span
                        className="badge font-monospace px-2.5 py-1.5"
                        style={{
                          backgroundColor: "#0f172a",
                          color: "#ffffff",
                          fontSize: "0.76rem",
                        }}
                      >
                        SHA #{activeCommit.commitHash}
                      </span>
                    </div>
                  );
                })()}
                {renderCommitInspector(activeCommit)}
              </div>
            ) : (
              <div className="p-4 text-center text-muted small">
                Vælg et commit på tidslinjen til venstre for at inspicere ændringen.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* INLINE EXPANDABLE VERTICAL TIMELINE (Side-by-Side Multi-Window View) */
        <div
          className="jgit-timeline-track overflow-auto pe-1"
          style={{ maxHeight: "520px" }}
        >
          {dateGroups.map((group) => {
            const isDateCollapsed = Boolean(collapsedDates[group.dateKey]);
            return (
              <div key={group.dateKey} className="mb-3" data-date={group.dateKey}>
                <div
                  className="jgit-date-group-header"
                  onClick={() => toggleDateCollapse(group.dateKey)}
                  title="Klik for at folde datoen sammen/ud"
                >
                  <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-calendar3 text-secondary"></i>
                    <span>{group.formattedDate}</span>
                    <span className="badge bg-dark bg-opacity-10 text-dark rounded-pill fw-semibold">
                      {group.items.length}
                    </span>
                  </div>
                  <i
                    className={`bi ${
                      isDateCollapsed ? "bi-chevron-right" : "bi-chevron-down"
                    } small text-secondary`}
                  ></i>
                </div>

                {!isDateCollapsed &&
                  group.items.map((c) => {
                    const isExpanded = effectiveSelectedHash === c.commitHash;
                    const isCompareBase = compareCommitHash === c.commitHash;
                    const meta = getCategoryMeta(c.category);

                    return (
                      <div
                        key={c.fullHash || c.commitHash}
                        className="jgit-commit-item"
                        data-commit-hash={c.commitHash}
                        data-category={c.category}
                      >
                        {renderSwimlaneGutter(c, isExpanded)}

                        <div
                          onClick={() => handleCommitClick(c.commitHash)}
                          className={`jgit-commit-card ${meta.cardClass} p-2.5 ${
                            isExpanded ? "active" : ""
                          } ${isCompareBase ? "compare-target" : ""}`}
                        >
                          <div className="d-flex justify-content-between align-items-center gap-2">
                            <div className="d-flex align-items-center gap-1.5 text-truncate">
                              <span
                                className="font-monospace small fw-bold px-1.5 py-0.5 rounded"
                                style={{
                                  backgroundColor: meta.bgHex,
                                  color: meta.textHex,
                                  border: `1px solid ${meta.borderHex}`,
                                  fontSize: "0.72rem",
                                }}
                              >
                                #{highlightText(c.commitHash, searchQuery)}
                              </span>
                              <span
                                className="badge rounded-pill"
                                style={{
                                  backgroundColor: meta.colorHex,
                                  color: "#ffffff",
                                  fontSize: "0.67rem",
                                }}
                              >
                                <i className={`bi ${meta.icon} me-1`}></i>
                                {meta.label}
                              </span>
                              <span className="small fw-bold text-dark text-truncate">
                                {highlightText(c.message, searchQuery)}
                              </span>
                            </div>
                            <div className="d-flex align-items-center gap-2 flex-shrink-0">
                              <span
                                className="text-muted fw-medium"
                                style={{ fontSize: "0.72rem" }}
                              >
                                {c.formattedTime}
                              </span>
                              <i
                                className={`bi ${
                                  isExpanded ? "bi-chevron-up" : "bi-chevron-down"
                                } small text-secondary`}
                              ></i>
                            </div>
                          </div>

                          {renderCommitChips(c, true)}

                          {isExpanded && (
                            <div onClick={(e) => e.stopPropagation()}>
                              {renderCommitInspector(c)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
