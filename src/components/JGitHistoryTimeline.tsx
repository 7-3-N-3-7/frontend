"use client";

import React, { useState, useMemo, useEffect } from "react";

export type JGitCommitCategory = "CLIENT" | "THERAPIST" | "CONFIDENTIAL";

export interface EnrichedGitCommit {
  commitHash: string;
  fullHash: string;
  message: string;
  author: string;
  timestamp: string;
  dateKey: string;
  formattedDate: string;
  formattedTime: string;
  snapshot: string;
  delta: string;
  category: JGitCommitCategory;
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
  const [internalSelectedHash, setInternalSelectedHash] = useState<string | null>(
    selectedCommitHash || null
  );

  useEffect(() => {
    if (selectedCommitHash) {
      setInternalSelectedHash(selectedCommitHash);
    }
  }, [selectedCommitHash]);

  // 1. Enrich commits with parent diff (delta), category, and localized date/time
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

      list.push({
        commitHash: c.commitHash || String(c.fullHash || "").slice(0, 8),
        fullHash: c.fullHash || c.commitHash || "",
        message: c.message || "Journal revision",
        author: c.author || "Ukendt",
        timestamp: c.timestamp || "",
        dateKey,
        formattedDate,
        formattedTime,
        snapshot: c.snapshot || "",
        delta: rawDelta || c.snapshot || "",
        category,
      });
    }
    return list;
  }, [commits, isTherapistView, locale]);

  // Ensure a valid commit is selected by default
  useEffect(() => {
    if (enrichedCommits.length > 0) {
      const exists = enrichedCommits.some(
        (c) => c.commitHash === internalSelectedHash
      );
      if (!exists) {
        setInternalSelectedHash(enrichedCommits[0].commitHash);
      }
    } else {
      setInternalSelectedHash(null);
    }
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

  const activeCommit = useMemo(
    () =>
      filteredCommits.find((c) => c.commitHash === internalSelectedHash) ||
      filteredCommits[0] ||
      null,
    [filteredCommits, internalSelectedHash]
  );

  const handleCommitClick = (hash: string) => {
    if (!splitView && internalSelectedHash === hash) {
      // In inline accordion mode, clicking the active commit collapses it
      setInternalSelectedHash(null);
      return;
    }
    setInternalSelectedHash(hash);
    if (onSelectCommit) {
      onSelectCommit(hash);
    }
  };

  const getCategoryLabel = (cat: JGitCommitCategory) => {
    switch (cat) {
      case "CONFIDENTIAL":
        return "Fortroligt notat";
      case "THERAPIST":
        return "Terapeut-notat";
      default:
        return "Klient-indlæg";
    }
  };

  const renderCommitInspector = (commit: EnrichedGitCommit) => {
    const deltaLines = (commit.delta || "")
      .split("\n")
      .filter((line) => line.trim() !== "");

    return (
      <div className="p-3 rounded-3 border bg-light bg-opacity-50 mt-2">
        {/* Toggle Bar: Delta/Diff (Default) vs Full Snapshot */}
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2 pb-2 border-bottom">
          <div className="small text-muted">
            <span className="font-monospace fw-bold text-dark">
              #{commit.commitHash}
            </span>{" "}
            • <strong>{commit.author}</strong> • kl. {commit.formattedTime}
          </div>

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

        {/* Content Box */}
        {viewMode === "DELTA" ? (
          <div className="jgit-diff-box">
            <div className="text-secondary mb-2" style={{ fontSize: "0.7rem" }}>
              @@ Tilføjet i commit #{commit.commitHash} ({commit.formattedDate} kl.{" "}
              {commit.formattedTime}) @@
            </div>
            {deltaLines.length === 0 ? (
              <div className="text-muted fst-italic">
                Ingen tekstændring i denne revision.
              </div>
            ) : (
              deltaLines.map((line, idx) => (
                <span key={idx} className="jgit-diff-line-add">
                  + {line}
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
            <div>{commit.snapshot || "Tomt dokument."}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="d-flex flex-column gap-3">
      {/* Top Filter Pills + Search Input */}
      <div className="d-flex flex-column gap-2 p-2.5 rounded-3 bg-light border">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div className="d-flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setActiveFilter("ALL")}
              className={`btn btn-sm rounded-pill px-2.5 py-0.5 ${
                activeFilter === "ALL"
                  ? "btn-dark fw-semibold"
                  : "btn-outline-secondary bg-white"
              }`}
              style={{ fontSize: "0.74rem" }}
            >
              Alle ({enrichedCommits.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("CLIENT")}
              className={`btn btn-sm rounded-pill px-2.5 py-0.5 ${
                activeFilter === "CLIENT"
                  ? "btn-dark fw-semibold"
                  : "btn-outline-secondary bg-white"
              }`}
              style={{ fontSize: "0.74rem" }}
            >
              Klient-indlæg (
              {enrichedCommits.filter((c) => c.category === "CLIENT").length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("THERAPIST")}
              className={`btn btn-sm rounded-pill px-2.5 py-0.5 ${
                activeFilter === "THERAPIST"
                  ? "btn-dark fw-semibold"
                  : "btn-outline-secondary bg-white"
              }`}
              style={{ fontSize: "0.74rem" }}
            >
              Terapeut-noter (
              {enrichedCommits.filter((c) => c.category === "THERAPIST").length})
            </button>
            {isTherapistView && (
              <button
                type="button"
                onClick={() => setActiveFilter("CONFIDENTIAL")}
                className={`btn btn-sm rounded-pill px-2.5 py-0.5 ${
                  activeFilter === "CONFIDENTIAL"
                    ? "btn-dark fw-semibold"
                    : "btn-outline-secondary bg-white"
                }`}
                style={{ fontSize: "0.74rem" }}
              >
                Fortrolige noter (
                {
                  enrichedCommits.filter((c) => c.category === "CONFIDENTIAL")
                    .length
                }
                )
              </button>
            )}
          </div>

          <div className="flex-grow-1" style={{ maxWidth: "260px" }}>
            <input
              type="text"
              className="form-control form-control-sm bg-white"
              placeholder="Søg i indhold, forfatter, #SHA..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Empty State */}
      {dateGroups.length === 0 ? (
        <div className="p-4 rounded-3 border bg-light text-center text-muted small">
          <i className="bi bi-git fs-4 d-block mb-1"></i>
          Ingen JGit-commits matcher det valgte filter.
        </div>
      ) : splitView ? (
        /* 2-COLUMN SPLIT-VIEW (Maximized Window or Drawer View) */
        <div className="row g-3">
          <div
            className="col-md-5 border-end pe-md-3 overflow-auto"
            style={{ maxHeight: "540px" }}
          >
            <div className="jgit-timeline-track">
              {dateGroups.map((group) => (
                <div key={group.dateKey} className="mb-3" data-date={group.dateKey}>
                  <div className="jgit-date-group-header">
                    <i className="bi bi-calendar3 text-secondary"></i>
                    <span>{group.formattedDate}</span>
                    <span className="badge bg-secondary-subtle text-secondary rounded-pill fw-normal">
                      {group.items.length}
                    </span>
                  </div>

                  {group.items.map((c) => {
                    const isSelected = activeCommit?.commitHash === c.commitHash;
                    return (
                      <div
                        key={c.fullHash || c.commitHash}
                        className="jgit-commit-item"
                        data-commit-hash={c.commitHash}
                        data-category={c.category}
                      >
                        <span className="jgit-timeline-dot" />
                        <div
                          onClick={() => handleCommitClick(c.commitHash)}
                          className={`jgit-commit-card p-2.5 ${
                            isSelected ? "active bg-light" : ""
                          }`}
                        >
                          <div className="d-flex justify-content-between align-items-center gap-2 mb-1">
                            <span className="font-monospace small fw-bold text-dark">
                              #{c.commitHash}
                            </span>
                            <div className="d-flex align-items-center gap-1">
                              <span
                                className="badge bg-light text-secondary border"
                                style={{ fontSize: "0.68rem" }}
                              >
                                {getCategoryLabel(c.category)}
                              </span>
                              <span
                                className="text-muted"
                                style={{ fontSize: "0.7rem" }}
                              >
                                {c.formattedTime}
                              </span>
                            </div>
                          </div>
                          <div className="small fw-medium text-dark text-truncate">
                            {c.message}
                          </div>
                          <div
                            className="text-muted text-truncate"
                            style={{ fontSize: "0.72rem" }}
                          >
                            Af {c.author}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="col-md-7">
            {activeCommit ? (
              <div>
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <div>
                    <span className="badge bg-light text-secondary border mb-1">
                      {getCategoryLabel(activeCommit.category)} •{" "}
                      {activeCommit.formattedDate}
                    </span>
                    <h6 className="fw-bold text-dark mb-0">
                      {activeCommit.message}
                    </h6>
                  </div>
                  <span className="badge bg-dark font-monospace">
                    SHA #{activeCommit.commitHash}
                  </span>
                </div>
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
          style={{ maxHeight: "480px" }}
        >
          {dateGroups.map((group) => (
            <div key={group.dateKey} className="mb-3" data-date={group.dateKey}>
              <div className="jgit-date-group-header">
                <i className="bi bi-calendar3 text-secondary"></i>
                <span>{group.formattedDate}</span>
                <span className="badge bg-secondary-subtle text-secondary rounded-pill fw-normal">
                  {group.items.length}
                </span>
              </div>

              {group.items.map((c) => {
                const isExpanded = internalSelectedHash === c.commitHash;
                return (
                  <div
                    key={c.fullHash || c.commitHash}
                    className="jgit-commit-item"
                    data-commit-hash={c.commitHash}
                    data-category={c.category}
                  >
                    <span className="jgit-timeline-dot" />
                    <div
                      onClick={() => handleCommitClick(c.commitHash)}
                      className={`jgit-commit-card p-2.5 ${
                        isExpanded ? "active" : ""
                      }`}
                    >
                      <div className="d-flex justify-content-between align-items-center gap-2">
                        <div className="d-flex align-items-center gap-2 text-truncate">
                          <span className="font-monospace small fw-bold text-dark">
                            #{c.commitHash}
                          </span>
                          <span
                            className="badge bg-light text-secondary border"
                            style={{ fontSize: "0.68rem" }}
                          >
                            {getCategoryLabel(c.category)}
                          </span>
                          <span className="small fw-semibold text-dark text-truncate">
                            {c.message}
                          </span>
                        </div>
                        <div className="d-flex align-items-center gap-2 flex-shrink-0">
                          <span
                            className="text-muted"
                            style={{ fontSize: "0.72rem" }}
                          >
                            {c.author} • {c.formattedTime}
                          </span>
                          <i
                            className={`bi ${
                              isExpanded ? "bi-chevron-up" : "bi-chevron-down"
                            } small text-secondary`}
                          ></i>
                        </div>
                      </div>

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
          ))}
        </div>
      )}
    </div>
  );
}
