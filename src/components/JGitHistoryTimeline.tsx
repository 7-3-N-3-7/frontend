"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";

export type JGitCommitCategory = "CLIENT" | "THERAPIST" | "CONFIDENTIAL";

export interface EnrichedGitCommit {
  commitHash: string;
  fullHash: string;
  message: string;
  author: string;
  authorDisplayName: string;
  authorInitials: string;
  timestamp: string;
  dateKey: string;
  formattedDate: string;
  shortDate: string;
  formattedTime: string;
  snapshot: string;
  parentSnapshot: string;
  delta: string;
  category: JGitCommitCategory;
  moodScore: number | null;
  isShared: boolean | null;
  laneKey: string;
  laneRoleLabel: string;
}

export interface JGitHistoryTimelineProps {
  commits: any[];
  isTherapistView: boolean;
  splitView?: boolean;
  selectedCommitHash?: string | null;
  onSelectCommit?: (commitHash: string) => void;
  locale?: string;
}

interface SwimlaneRow {
  laneKey: string;
  authorDisplayName: string;
  authorInitials: string;
  roleLabel: string;
  category: JGitCommitCategory;
  commitCount: number;
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
    author.toLowerCase().includes("psykolog") ||
    author.toLowerCase().includes("bjens") ||
    author.toLowerCase().includes("bo jensen")
  ) {
    return "THERAPIST";
  }

  return "CLIENT";
}

function formatReadableAuthorName(
  rawAuthor: string,
  category: JGitCommitCategory
): string {
  const clean = (rawAuthor || "").trim();
  const lower = clean.toLowerCase();

  if (
    lower === "bjens" ||
    lower === "bijens" ||
    lower === "bo_jensen" ||
    lower === "bojensen" ||
    lower.includes("bo jensen") ||
    lower === "therapist" ||
    lower === "terapeut"
  ) {
    return "Bo Jensen (Terapeut)";
  }
  if (
    lower === "anders_sand" ||
    lower === "anderssand" ||
    lower === "anders" ||
    lower.includes("anders sand") ||
    lower === "client" ||
    lower === "klient"
  ) {
    return "Anders Sand";
  }

  if (!clean) {
    return category === "CLIENT" ? "Anders Sand" : "Bo Jensen (Terapeut)";
  }

  if (clean.includes("_") || clean.includes(".")) {
    const titleCased = clean
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    return category === "THERAPIST" || category === "CONFIDENTIAL"
      ? `${titleCased} (Terapeut)`
      : titleCased;
  }

  return clean;
}

function parseCommitMetadata(delta: string, snapshot: string): {
  moodScore: number | null;
  isShared: boolean | null;
} {
  const source = `${delta}\n${snapshot}`;
  let moodScore: number | null;
  moodScore = null;
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
    .replace(/\(.*?\)/g, "")
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
  selectedCommitHash,
  onSelectCommit,
  locale = "da",
}: JGitHistoryTimelineProps) {
  const isEn = locale === "en";
  const loc = useCallback(
    (daText: string, enText: string) => (isEn ? enText : daText),
    [isEn]
  );
  const [activeFilter, setActiveFilter] = useState<
    "ALL" | "CLIENT" | "THERAPIST" | "CONFIDENTIAL"
  >("ALL");
  const [hideConfidential, setHideConfidential] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"DELTA" | "COMPARE" | "SNAPSHOT">("DELTA");
  const [compareCommitHash, setCompareCommitHash] = useState<string | null>(null);

  // Extended Semantic Zoom (35% Macro -> 100% Standard -> 220% Micro Detail)
  const [zoomScale, setZoomScale] = useState<number>(100);
  // Start and End Date Filters (YYYY-MM-DD)
  const [startDateFilter, setStartDateFilter] = useState<string>("");
  const [endDateFilter, setEndDateFilter] = useState<string>("");

  // Drag-to-pan state on 2D canvas (both X and Y axes)
  const trackRef = useRef<HTMLDivElement | null>(null);
  const isDraggingCanvasRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartYRef = useRef(0);
  const dragScrollLeftRef = useRef(0);
  const dragScrollTopRef = useRef(0);
  const didDragMoveRef = useRef(false);

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

  // 1. Enrich commits with parent diff (delta), category, readable therapist/client name, mood/shared chips, and 2D swimlane key
  const enrichedCommits = useMemo<EnrichedGitCommit[]>(() => {
    if (!Array.isArray(commits) || commits.length === 0) return [];

    const list: EnrichedGitCommit[] = [];
    for (let i = 0; i < commits.length; i++) {
      const c = commits[i];
      const parent = commits[i + 1];
      const parentSnapshotStr = parent?.snapshot || "";
      const rawDelta = computeCommitDelta(c.snapshot || "", parentSnapshotStr);
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
      const shortDate = new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
      }).format(dateObj);
      const formattedTime = new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(dateObj);

      const authorStr = c.author || "Ukendt";
      const deltaStr = rawDelta || c.snapshot || "";
      const authorDisplayName = formatReadableAuthorName(authorStr, category);
      const { moodScore, isShared } = parseCommitMetadata(deltaStr, c.snapshot || "");

      const rawMessage = String(c.message || "Journal revision")
        .replace(/^Added\s+journal\s+entry\s*:\s*/i, "")
        .trim();

      const canonicalAuthorKey =
        category === "CLIENT" ? "client_main" : "therapist_main";

      const laneKey =
        category === "CLIENT"
          ? `CLIENT::${canonicalAuthorKey}`
          : category === "CONFIDENTIAL"
          ? `CONFIDENTIAL::${canonicalAuthorKey}`
          : `THERAPIST::${canonicalAuthorKey}`;

      const laneRoleLabel =
        category === "CLIENT"
          ? loc("Klient-spor", "Client Lane")
          : category === "CONFIDENTIAL"
          ? loc("🔒 Fortroligt klinisk spor", "🔒 Confidential Clinical Lane")
          : loc("Terapeut-spor (Delt)", "Therapist Lane (Shared)");

      list.push({
        commitHash: c.commitHash || String(c.fullHash || "").slice(0, 8),
        fullHash: c.fullHash || c.commitHash || "",
        message: rawMessage || "Journal revision",
        author: authorStr,
        authorDisplayName,
        authorInitials: computeInitials(authorDisplayName),
        timestamp: c.timestamp || "",
        dateKey,
        formattedDate,
        shortDate,
        formattedTime,
        snapshot: c.snapshot || "",
        parentSnapshot: parentSnapshotStr,
        delta: deltaStr,
        category,
        moodScore,
        isShared,
        laneKey,
        laneRoleLabel,
      });
    }
    return list;
  }, [commits, isTherapistView, locale, loc]);

  const confidentialCommitsCount = useMemo(
    () => enrichedCommits.filter((c) => c.category === "CONFIDENTIAL").length,
    [enrichedCommits]
  );

  // 2. Apply category filter, confidential screen-share toggle & search query
  const filteredCommits = useMemo(() => {
    return enrichedCommits.filter((c) => {
      if (hideConfidential && c.category === "CONFIDENTIAL") {
        return false;
      }
      if (activeFilter !== "ALL" && c.category !== activeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const haystack = `${c.commitHash} ${c.fullHash} ${c.message} ${c.author} ${c.authorDisplayName} ${c.delta} ${c.snapshot} ${c.formattedDate}`.toLowerCase();
        if (!haystack.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [enrichedCommits, activeFilter, hideConfidential, searchQuery]);

  // 2b. Apply Start Date & End Date filter
  const visibleWindowCommits = useMemo(() => {
    if (filteredCommits.length === 0) return [];
    return filteredCommits.filter((c) => {
      if (startDateFilter && c.dateKey < startDateFilter) {
        return false;
      }
      if (endDateFilter && c.dateKey > endDateFilter) {
        return false;
      }
      return true;
    });
  }, [filteredCommits, startDateFilter, endDateFilter]);

  // Earliest & latest available commit dates for date picker min/max hints
  const { minAvailableDate, maxAvailableDate } = useMemo(() => {
    if (enrichedCommits.length === 0) {
      return { minAvailableDate: "", maxAvailableDate: "" };
    }
    const dates = enrichedCommits.map((c) => c.dateKey).filter(Boolean).sort();
    return {
      minAvailableDate: dates[0] || "",
      maxAvailableDate: dates[dates.length - 1] || "",
    };
  }, [enrichedCommits]);

  // Build 2D Y-Axis Swimlanes (Client lane on top, each Therapist on their own named lane below)
  const swimlanes = useMemo<SwimlaneRow[]>(() => {
    const laneMap = new Map<string, SwimlaneRow>();
    for (const c of visibleWindowCommits) {
      const existing = laneMap.get(c.laneKey);
      if (existing) {
        existing.commitCount += 1;
      } else {
        laneMap.set(c.laneKey, {
          laneKey: c.laneKey,
          authorDisplayName: c.authorDisplayName,
          authorInitials: c.authorInitials,
          roleLabel: c.laneRoleLabel,
          category: c.category,
          commitCount: 1,
        });
      }
    }

    // Sort lanes so CLIENT lanes are at the top, followed by THERAPIST lanes, then CONFIDENTIAL
    const orderWeight = (cat: JGitCommitCategory) =>
      cat === "CLIENT" ? 0 : cat === "THERAPIST" ? 1 : 2;

    return Array.from(laneMap.values()).sort((a, b) => {
      const wDiff = orderWeight(a.category) - orderWeight(b.category);
      if (wDiff !== 0) return wDiff;
      return a.authorDisplayName.localeCompare(b.authorDisplayName);
    });
  }, [visibleWindowCommits]);

  const effectiveSelectedHash = useMemo(() => {
    if (visibleWindowCommits.length === 0) return null;
    if (internalSelectedHash === "__COLLAPSED__") return null;
    if (
      internalSelectedHash &&
      visibleWindowCommits.some((c) => c.commitHash === internalSelectedHash)
    ) {
      return internalSelectedHash;
    }
    return visibleWindowCommits[0].commitHash;
  }, [visibleWindowCommits, internalSelectedHash]);

  // Group by date for data-date attribute compatibility
  const dateGroups = useMemo(() => {
    const groups: Array<{
      dateKey: string;
      formattedDate: string;
      items: EnrichedGitCommit[];
    }> = [];
    const map = new Map<string, EnrichedGitCommit[]>();

    for (const c of visibleWindowCommits) {
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
  }, [visibleWindowCommits]);

  const activeCommitIndex = useMemo(() => {
    if (visibleWindowCommits.length === 0) return -1;
    if (!effectiveSelectedHash) return 0;
    const idx = visibleWindowCommits.findIndex(
      (c) => c.commitHash === effectiveSelectedHash
    );
    return idx >= 0 ? idx : 0;
  }, [visibleWindowCommits, effectiveSelectedHash]);

  const activeCommit = useMemo(
    () => (activeCommitIndex >= 0 ? visibleWindowCommits[activeCommitIndex] : null),
    [visibleWindowCommits, activeCommitIndex]
  );

  // Base commit for "Før (Forrige Version)" vs "Nu (Nuværende Version)"
  const previousOrComparedCommit = useMemo(() => {
    if (compareCommitHash) {
      return enrichedCommits.find((c) => c.commitHash === compareCommitHash) || null;
    }
    if (activeCommitIndex >= 0 && activeCommitIndex + 1 < visibleWindowCommits.length) {
      return visibleWindowCommits[activeCommitIndex + 1];
    }
    if (activeCommit) {
      const fullIdx = enrichedCommits.findIndex(
        (c) => c.commitHash === activeCommit.commitHash
      );
      if (fullIdx >= 0 && fullIdx + 1 < enrichedCommits.length) {
        return enrichedCommits[fullIdx + 1];
      }
    }
    return null;
  }, [compareCommitHash, enrichedCommits, visibleWindowCommits, activeCommitIndex, activeCommit]);

  const scrollCommitIntoHorizontalView = useCallback((hash: string) => {
    if (!trackRef.current) return;
    const container = trackRef.current;
    const targetEl = container.querySelector<HTMLElement>(
      `[data-commit-hash="${hash}"]`
    );
    if (targetEl) {
      const targetLeft =
        targetEl.offsetLeft -
        container.clientWidth / 2 +
        targetEl.clientWidth / 2;
      container.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: "smooth",
      });
    }
  }, []);

  const selectCommitAndNotify = useCallback(
    (hash: string) => {
      setInternalSelectedHash(hash);
      if (onSelectCommit) {
        onSelectCommit(hash);
      }
      setTimeout(() => scrollCommitIntoHorizontalView(hash), 40);
    },
    [onSelectCommit, scrollCommitIntoHorizontalView]
  );

  const handleCommitClick = (hash: string, e?: React.MouseEvent) => {
    if (didDragMoveRef.current) {
      didDragMoveRef.current = false;
      return;
    }
    // Shift+Click sets the "Før" comparison commit and opens COMPARE mode directly
    if (e && e.shiftKey && activeCommit && hash !== activeCommit.commitHash) {
      setCompareCommitHash(hash);
      setViewMode("COMPARE");
      return;
    }
    selectCommitAndNotify(hash);
  };

  const handleCompareWithCommit = (hash: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCompareCommitHash(hash);
    setViewMode("COMPARE");
  };

  const navigateRelativeCommit = useCallback(
    (direction: -1 | 1) => {
      if (visibleWindowCommits.length === 0) return;
      const nextIdx = activeCommitIndex + direction;
      if (nextIdx >= 0 && nextIdx < visibleWindowCommits.length) {
        const target = visibleWindowCommits[nextIdx];
        selectCommitAndNotify(target.commitHash);
      }
    },
    [visibleWindowCommits, activeCommitIndex, selectCommitAndNotify]
  );

  // Drag-to-pan handlers on the 2D Timeline Canvas (simultaneous X and Y axes)
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || e.button !== 0) return;
    isDraggingCanvasRef.current = true;
    didDragMoveRef.current = false;
    dragStartXRef.current = e.clientX;
    dragStartYRef.current = e.clientY;
    dragScrollLeftRef.current = trackRef.current.scrollLeft;
    dragScrollTopRef.current = trackRef.current.scrollTop;
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingCanvasRef.current || !trackRef.current) return;
    const walkX = (e.clientX - dragStartXRef.current) * 1.25;
    const walkY = (e.clientY - dragStartYRef.current) * 1.25;
    if (Math.hypot(walkX, walkY) > 5) {
      didDragMoveRef.current = true;
      e.preventDefault();
    }
    trackRef.current.scrollLeft = dragScrollLeftRef.current - walkX;
    trackRef.current.scrollTop = dragScrollTopRef.current - walkY;
  };

  const handleCanvasMouseUpOrLeave = () => {
    isDraggingCanvasRef.current = false;
  };

  const adjustZoom = (delta: number) => {
    setZoomScale((prev) => Math.max(35, Math.min(220, prev + delta)));
  };

  const resetZoomAndRange = () => {
    setZoomScale(100);
    setStartDateFilter("");
    setEndDateFilter("");
  };

  const getCategoryMeta = (cat: JGitCommitCategory) => {
    switch (cat) {
      case "CONFIDENTIAL":
        return {
          label: loc("Fortroligt notat", "Confidential Note"),
          pillBg: "#f5dec4",
          pillText: "#6e4720",
          cardBg: "linear-gradient(145deg, #fbf4eb 0%, #f5e6d3 100%)",
          cardBorder: "#e8d0b3",
          dotColor: "#eab376",
          dotGlow: "rgba(234, 179, 118, 0.45)",
          avatarBg: "#78553a",
          cardClass: "cat-confidential",
          nodeClass: "node-confidential",
        };
      case "THERAPIST":
        return {
          label: loc("Terapeutisk opfølgning", "Therapist Follow-up"),
          pillBg: "#dcd3f8",
          pillText: "#453578",
          cardBg: "linear-gradient(145deg, #f3effe 0%, #e9e2fc 100%)",
          cardBorder: "#cfc3f4",
          dotColor: "#9f85f7",
          dotGlow: "rgba(159, 133, 247, 0.48)",
          avatarBg: "#5e479c",
          cardClass: "cat-therapist",
          nodeClass: "node-therapist",
        };
      default:
        return {
          label: loc("Klient-indlæg", "Client Entry"),
          pillBg: "#d4ecdf",
          pillText: "#23533d",
          cardBg: "linear-gradient(145deg, #f1f8f4 0%, #e4f2ea 100%)",
          cardBorder: "#c2e2d0",
          dotColor: "#7bc49d",
          dotGlow: "rgba(123, 196, 157, 0.45)",
          avatarBg: "#528c6e",
          cardClass: "cat-client",
          nodeClass: "node-client",
        };
    }
  };

  const [showAllUnchangedEntries, setShowAllUnchangedEntries] = useState(false);

  interface ParsedJournalBlock {
    id: string;
    rawBlock: string;
    rawLines: string[];
    title: string;
    timestampLabel: string;
    category: JGitCommitCategory;
    moodScore: number | null;
    sharedLabel: string | null;
    bodyLines: string[];
  }

  const parseSnapshotIntoBlocks = useCallback(
    (snapshotText: string): ParsedJournalBlock[] => {
      if (!snapshotText || !snapshotText.trim()) return [];
      const rawLines = snapshotText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      const blocks: string[][] = [];
      let current: string[] = [];

      for (const line of rawLines) {
        if (line === "<!-- INTERNAL_MEDICAL_NOTES -->") {
          continue;
        }
        const isBlockStart =
          line.startsWith("## ") ||
          line.startsWith("# ") ||
          line.startsWith("**[CONFIDENTIAL") ||
          line.startsWith("[CONFIDENTIAL");

        if (isBlockStart && current.length > 0) {
          blocks.push(current);
          current = [line];
        } else {
          current.push(line);
        }
      }
      if (current.length > 0) {
        blocks.push(current);
      }

      return blocks.map((bLines, idx) => {
        const rawBlock = bLines.join("\n");
        const firstLine = bLines[0] || "Journalnotat";

        let category: JGitCommitCategory = "CLIENT";
        if (
          rawBlock.includes("CONFIDENTIAL CLINICAL NOTE") ||
          rawBlock.includes("INTERNAL_MEDICAL_NOTES") ||
          firstLine.toLowerCase().includes("fortrolig")
        ) {
          category = "CONFIDENTIAL";
        } else if (
          firstLine.toLowerCase().includes("terapeut") ||
          firstLine.toLowerCase().includes("opfølgning") ||
          firstLine.toLowerCase().includes("psykolog") ||
          firstLine.toLowerCase().includes("fælles statusnotat")
        ) {
          category = "THERAPIST";
        }

        let title = firstLine
          .replace(/^#+\s*/, "")
          .replace(/^\*\*|\*\*$/g, "")
          .trim();
        let timestampLabel = "";

        const isoMatch = title.match(
          /\(?(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?\)?/
        );
        if (isoMatch) {
          timestampLabel = `${isoMatch[1]} kl. ${isoMatch[2]}`;
          title = title
            .replace(isoMatch[0], "")
            .replace(/\(\s*\)/g, "")
            .replace(/\|\s*$/, "")
            .replace(/^\[CONFIDENTIAL CLINICAL NOTE\s*\|\s*/i, "Fortroligt notat • ")
            .replace(/\]$/, "")
            .trim();
        }

        let moodScore: number | null = null;
        let sharedLabel: string | null = null;
        const bodyLines: string[] = [];

        for (let i = 1; i < bLines.length; i++) {
          const line = bLines[i];
          const mMatch = line.match(/(?:Mood|Humør)\s*:\s*(\d{1,2})\s*\/\s*10/i);
          if (mMatch) {
            moodScore = parseInt(mMatch[1], 10);
            if (line.toLowerCase().includes("shared:")) {
              const isShared =
                !line.toLowerCase().includes("shared: false") &&
                !line.toLowerCase().includes("privat");
              sharedLabel = isShared
                ? loc("Delt med behandler", "Shared with therapist")
                : loc("Privat notat", "Private entry");
            }
            continue;
          }
          bodyLines.push(line);
        }

        if (category === "CONFIDENTIAL") {
          sharedLabel = loc("Kun terapeuter", "Therapists only");
        }

        return {
          id: `block-${idx}-${title.slice(0, 18)}`,
          rawBlock,
          rawLines: bLines,
          title: title || loc("Journalnotat", "Journal Entry"),
          timestampLabel,
          category,
          moodScore,
          sharedLabel,
          bodyLines,
        };
      }).filter((b) => (isTherapistView && !hideConfidential) || b.category !== "CONFIDENTIAL");
    },
    [isTherapistView, hideConfidential, loc]
  );

  const renderStructuredEntryCard = (
    block: ParsedJournalBlock,
    diffState: "ADDED" | "REMOVED" | "CONTEXT",
    commitAuthorLabel?: string
  ) => {
    const meta = getCategoryMeta(block.category);

    const statusBadge =
      diffState === "ADDED"
        ? {
            text: loc("+ Tilføjet i denne revision", "+ Added in this revision"),
            bg: "#bbf7d0",
            color: "#14532d",
            border: "#4ade80",
          }
        : diffState === "REMOVED"
        ? {
            text: loc("− Fjernet / Ændret", "− Removed / Modified"),
            bg: "#fecdd3",
            color: "#881337",
            border: "#fb7185",
          }
        : {
            text: loc("Forrige indlæg (Kontekst)", "Previous entry (Context)"),
            bg: meta.pillBg,
            color: meta.pillText,
            border: meta.cardBorder,
          };

    return (
      <div
        key={block.id}
        className={`jgit-structured-entry-card ${meta.cardClass} diff-${diffState.toLowerCase()}`}
        style={{
          background: meta.cardBg,
          borderColor:
            diffState === "ADDED"
              ? "#4ade80"
              : diffState === "REMOVED"
              ? "#fb7185"
              : meta.cardBorder,
          borderLeftColor: meta.dotColor,
        }}
      >
        {/* Top Row: Category Badge + Author Badge + Diff Status Badge + Timestamp */}
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-1.5 mb-2">
          <div className="d-flex flex-wrap align-items-center gap-1.5">
            <span
              className="jgit-entry-cat-badge"
              style={{
                backgroundColor: meta.pillBg,
                color: meta.pillText,
              }}
            >
              <span
                className="jgit-entry-cat-dot"
                style={{ backgroundColor: meta.dotColor }}
              />
              {meta.label}
            </span>

            {commitAuthorLabel && (
              <span
                className="badge rounded-pill border fw-semibold"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.85)",
                  color: "#1e293b",
                  fontSize: "0.71rem",
                }}
              >
                <i
                  className={`bi ${
                    block.category === "CLIENT" ? "bi-person-fill" : "bi-person-badge-fill"
                  } me-1`}
                ></i>
                {commitAuthorLabel}
              </span>
            )}

            <span
              className="jgit-entry-diff-badge"
              style={{
                backgroundColor: statusBadge.bg,
                color: statusBadge.color,
                borderColor: statusBadge.border,
              }}
            >
              {statusBadge.text}
            </span>
          </div>

          {block.timestampLabel && (
            <span className="text-muted fw-medium" style={{ fontSize: "0.72rem" }}>
              <i className="bi bi-clock me-1"></i>
              {block.timestampLabel}
            </span>
          )}
        </div>

        {/* Entry Heading */}
        <div className="fw-bold text-dark mb-1.5" style={{ fontSize: "0.94rem" }}>
          {highlightText(block.title, searchQuery)}
        </div>

        {/* Metadata Chips Row (Mood & Sharing) */}
        {(block.moodScore !== null || block.sharedLabel) && (
          <div className="d-flex flex-wrap align-items-center gap-1.5 mb-2">
            {block.moodScore !== null && (
              <span
                className="jgit-card-bottom-chip"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.78)",
                  color: "#1e293b",
                  border: `1px solid ${meta.cardBorder}`,
                }}
              >
                <span>😊</span>
                <span>
                  {loc("Humør", "Mood")} {block.moodScore}/10
                </span>
              </span>
            )}
            {block.sharedLabel && (
              <span
                className="jgit-card-bottom-chip"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.78)",
                  color: meta.pillText,
                  border: `1px solid ${meta.cardBorder}`,
                }}
              >
                <i
                  className={`bi ${
                    block.category === "CONFIDENTIAL"
                      ? "bi-shield-lock-fill"
                      : "bi-share-fill"
                  }`}
                ></i>
                <span>{block.sharedLabel}</span>
              </span>
            )}
          </div>
        )}

        {/* Clean Formatted Body Text */}
        <div className="d-flex flex-column gap-1">
          {block.bodyLines.map((line, i) => (
            <div
              key={i}
              className={
                diffState === "ADDED"
                  ? "jgit-diff-line-add"
                  : diffState === "REMOVED"
                  ? "jgit-diff-line-remove"
                  : "jgit-entry-body-text"
              }
            >
              {diffState === "ADDED"
                ? `+ ${line}`
                : diffState === "REMOVED"
                ? `- ${line}`
                : highlightText(line, searchQuery)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render Full-Width Bottom Inspector Panel (Revisionshistorik column removed for 100% width)
  const renderBottomFullWidthInspector = () => {
    const commit = activeCommit;
    const hasNewer = activeCommitIndex > 0;
    const hasOlder =
      activeCommitIndex >= 0 && activeCommitIndex < visibleWindowCommits.length - 1;

    const baseSnapshot = previousOrComparedCommit
      ? previousOrComparedCommit.snapshot
      : commit?.parentSnapshot || "";

    const currSnapshot = commit?.snapshot || "";

    const prevBlocks = parseSnapshotIntoBlocks(baseSnapshot);
    const currBlocks = parseSnapshotIntoBlocks(currSnapshot);
    const deltaBlocks = parseSnapshotIntoBlocks(commit?.delta || "");

    const prevRawSet = new Set(prevBlocks.map((b) => b.rawBlock));
    const currRawSet = new Set(currBlocks.map((b) => b.rawBlock));

    const removedBlocks = prevBlocks.filter((b) => !currRawSet.has(b.rawBlock));
    const unchangedPrevBlocks = prevBlocks.filter((b) =>
      currRawSet.has(b.rawBlock)
    );

    const addedBlocksFromDiff = currBlocks.filter(
      (b) => !prevRawSet.has(b.rawBlock)
    );
    const addedBlocks =
      addedBlocksFromDiff.length > 0 ? addedBlocksFromDiff : deltaBlocks;
    const unchangedCurrBlocks = currBlocks.filter((b) =>
      prevRawSet.has(b.rawBlock)
    );

    const visiblePrevContextBlocks = showAllUnchangedEntries
      ? unchangedPrevBlocks
      : unchangedPrevBlocks.slice(-1);
    const hiddenPrevCount = Math.max(
      0,
      unchangedPrevBlocks.length - visiblePrevContextBlocks.length
    );

    const visibleCurrContextBlocks = showAllUnchangedEntries
      ? unchangedCurrBlocks
      : [];
    const hiddenCurrCount = Math.max(
      0,
      unchangedCurrBlocks.length - visibleCurrContextBlocks.length
    );

    // Blocks added specifically in the selected commit (against its immediate parent commit)
    const immediateParentBlocks = parseSnapshotIntoBlocks(commit?.parentSnapshot || "");
    const immediateParentRawSet = new Set(immediateParentBlocks.map((b) => b.rawBlock));
    const singleCommitAddedFromParent = currBlocks.filter(
      (b) => !immediateParentRawSet.has(b.rawBlock)
    );
    const singleCommitAddedBlocks =
      singleCommitAddedFromParent.length > 0
        ? singleCommitAddedFromParent
        : deltaBlocks.length > 0
        ? deltaBlocks
        : currBlocks.slice(-1);

    return (
      <div className="jgit-compare-versions-panel mt-2 w-100">
        {!commit ? (
          <div className="text-center py-5 text-muted">
            {loc(
              "Klik på et commit på 2D-tidslinjen ovenfor for at se ændringen.",
              "Click a commit on the 2D timeline above to inspect the change."
            )}
          </div>
        ) : (
          <>
            {/* Header Row: Title + 3 Mode Buttons + Nyere / Ældre / Luk vindue */}
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <div>
                <h5 className="fw-bold text-dark mb-1" style={{ fontSize: "1.12rem" }}>
                  {viewMode === "DELTA"
                    ? loc(
                        `Tilføjet i dette commit - Revision ${activeCommitIndex + 1} af ${visibleWindowCommits.length}`,
                        `Added in this commit - Revision ${activeCommitIndex + 1} of ${visibleWindowCommits.length}`
                      )
                    : viewMode === "COMPARE"
                    ? loc(
                        `Sammenlign 2 commits - Revision ${activeCommitIndex + 1} af ${visibleWindowCommits.length}`,
                        `Compare 2 commits - Revision ${activeCommitIndex + 1} of ${visibleWindowCommits.length}`
                      )
                    : loc(
                        `Fuld Journal-Snapshot - Revision ${activeCommitIndex + 1} af ${visibleWindowCommits.length}`,
                        `Full Journal Snapshot - Revision ${activeCommitIndex + 1} of ${visibleWindowCommits.length}`
                      )}
                </h5>
                {/* Color Legend + Quick Compare Hint */}
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <span
                    className="jgit-entry-cat-badge"
                    style={{ backgroundColor: "#d4ecdf", color: "#23533d" }}
                  >
                    <span
                      className="jgit-entry-cat-dot"
                      style={{ backgroundColor: "#7bc49d" }}
                    />
                    {loc("Klient-indlæg", "Client Entry")}
                  </span>
                  <span
                    className="jgit-entry-cat-badge"
                    style={{ backgroundColor: "#dcd3f8", color: "#453578" }}
                  >
                    <span
                      className="jgit-entry-cat-dot"
                      style={{ backgroundColor: "#9f85f7" }}
                    />
                    {loc("Terapeutisk opfølgning", "Therapist Follow-up")}
                  </span>
                  {isTherapistView && (
                    <span
                      className="jgit-entry-cat-badge"
                      style={{ backgroundColor: "#f5dec4", color: "#6e4720" }}
                    >
                      <span
                        className="jgit-entry-cat-dot"
                        style={{ backgroundColor: "#eab376" }}
                      />
                      {loc("Fortroligt notat", "Confidential Note")}
                    </span>
                  )}
                  <span className="text-muted small ms-1" style={{ fontSize: "0.73rem" }}>
                    <i className="bi bi-lightbulb me-1"></i>
                    {loc("Tip: Hold ", "Tip: Hold ")}
                    <kbd className="px-1 py-0 bg-white text-dark border">Shift</kbd>
                    {loc(
                      " + klik på et andet kort i 2D-grafen (eller klik på ",
                      " + click another card in the 2D graph (or click "
                    )}
                    <i className="bi bi-arrow-left-right"></i>
                    {loc(
                      ") for at sammenligne 2 commits.",
                      ") to compare 2 commits."
                    )}
                  </span>
                </div>
              </div>

              <div className="d-flex flex-wrap align-items-center gap-2">
                {/* 3 View Mode Toggle Buttons: 1) Ændring i dette commit, 2) Sammenlign 2 commits, 3) Fuld Journal-Snapshot */}
                <div className="btn-group btn-group-sm" role="group">
                  <button
                    type="button"
                    onClick={() => setViewMode("DELTA")}
                    className={`btn rounded-start-pill px-2.5 py-1 ${
                      viewMode === "DELTA"
                        ? "btn-dark fw-semibold"
                        : "btn-outline-secondary bg-white"
                    }`}
                    style={{ fontSize: "0.75rem" }}
                  >
                    {loc("Ændring i dette commit", "Change in this commit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("COMPARE")}
                    className={`btn px-2.5 py-1 ${
                      viewMode === "COMPARE"
                        ? "btn-dark fw-semibold"
                        : "btn-outline-secondary bg-white"
                    }`}
                    style={{ fontSize: "0.75rem" }}
                  >
                    {loc("Sammenlign 2 commits", "Compare 2 commits")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("SNAPSHOT")}
                    className={`btn rounded-end-pill px-2.5 py-1 ${
                      viewMode === "SNAPSHOT"
                        ? "btn-dark fw-semibold"
                        : "btn-outline-secondary bg-white"
                    }`}
                    style={{ fontSize: "0.75rem" }}
                  >
                    {loc("Fuld Journal-Snapshot", "Full Journal Snapshot")}
                  </button>
                </div>

                <button
                  type="button"
                  disabled={!hasNewer}
                  onClick={() => navigateRelativeCommit(-1)}
                  className="jgit-nav-pill-btn jgit-nav-pill-newer"
                >
                  {loc("Nyere", "Newer")}
                </button>
                <button
                  type="button"
                  disabled={!hasOlder}
                  onClick={() => navigateRelativeCommit(1)}
                  className="jgit-nav-pill-btn jgit-nav-pill-older"
                >
                  {loc("Ældre", "Older")}
                </button>
                <button
                  type="button"
                  onClick={() => setInternalSelectedHash("__COLLAPSED__")}
                  className="jgit-nav-pill-btn jgit-nav-pill-close"
                >
                  ✕ {loc("Luk vindue", "Close inspector")}
                </button>
              </div>
            </div>

            {/* MODE 1 (DEFAULT): ONLY what was added in the selected commit */}
            {viewMode === "DELTA" && (
              <div className="jgit-version-box p-3.5">
                <div className="jgit-version-box-title d-flex flex-wrap justify-content-between align-items-center gap-2 pb-2 mb-3 border-bottom">
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <span className="fw-bold text-dark">
                      {loc("Tilføjet i dette commit", "Added in this commit")}
                    </span>
                    <span
                      className="badge rounded-pill border fw-semibold"
                      style={{
                        backgroundColor:
                          commit.category === "THERAPIST" ? "#ede9fe" : "#dcfce7",
                        color:
                          commit.category === "THERAPIST" ? "#4c1d95" : "#14532d",
                        fontSize: "0.75rem",
                      }}
                    >
                      <i
                        className={`bi ${
                          commit.category === "CLIENT"
                            ? "bi-person-fill"
                            : "bi-person-badge-fill"
                        } me-1`}
                      ></i>
                      {commit.authorDisplayName}
                    </span>
                    <span
                      className="text-muted fw-normal"
                      style={{ fontSize: "0.78rem" }}
                    >
                      (#{commit.commitHash} • {commit.formattedDate} kl.{" "}
                      {commit.formattedTime})
                    </span>
                  </div>
                  <span
                    className="badge rounded-pill px-2.5 py-1"
                    style={{
                      backgroundColor: "#def3e4",
                      color: "#1c4b2e",
                      fontSize: "0.73rem",
                    }}
                  >
                    +{singleCommitAddedBlocks.length}{" "}
                    {singleCommitAddedBlocks.length === 1
                      ? loc("nyt indlæg i dette commit", "new entry in this commit")
                      : loc("nye indlæg i dette commit", "new entries in this commit")}
                  </span>
                </div>

                <div className="jgit-version-content d-flex flex-column gap-2.5">
                  {singleCommitAddedBlocks.length === 0 ? (
                    <div className="p-3 rounded-3 bg-light border text-muted small">
                      {loc(
                        "Ingen nye indlæg tilføjet i dette commit.",
                        "No new entries added in this commit."
                      )}
                    </div>
                  ) : (
                    singleCommitAddedBlocks.map((b) =>
                      renderStructuredEntryCard(b, "ADDED", commit.authorDisplayName)
                    )
                  )}
                </div>
              </div>
            )}

            {/* MODE 2 (MIDDLE OPTION): Compare 2 commits side-by-side (Før / Nu) */}
            {viewMode === "COMPARE" && (
              <>
                <div className="row g-3 align-items-center mb-2">
                  <div className="col-md-6 d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <span className="fw-bold text-dark" style={{ fontSize: "0.95rem" }}>
                        {loc("Før", "Before")}
                      </span>
                      <select
                        className="form-select form-select-sm bg-white rounded-3 border"
                        style={{ width: "auto", minWidth: "255px", fontSize: "0.78rem" }}
                        value={compareCommitHash || ""}
                        onChange={(e) => setCompareCommitHash(e.target.value || null)}
                        aria-label={loc(
                          "Sammenlign med en anden revision",
                          "Compare with another revision"
                        )}
                      >
                        <option value="">
                          {loc(
                            "Sammenlign med forrige (Standard)",
                            "Compare with previous (Default)"
                          )}
                        </option>
                        {enrichedCommits
                          .filter((c) => c.commitHash !== commit.commitHash)
                          .map((c) => (
                            <option key={c.commitHash} value={c.commitHash}>
                              vs. #{c.commitHash} — {c.authorDisplayName} ({c.formattedDate} kl. {c.formattedTime})
                            </option>
                          ))}
                      </select>
                    </div>
                    {(hiddenPrevCount > 0 || hiddenCurrCount > 0 || showAllUnchangedEntries) && (
                      <button
                        type="button"
                        onClick={() => setShowAllUnchangedEntries((v) => !v)}
                        className="btn btn-sm btn-light border rounded-pill px-2.5 py-0.5 text-secondary fw-semibold"
                        style={{ fontSize: "0.72rem" }}
                      >
                        {showAllUnchangedEntries
                          ? loc(
                              "Skjul uændrede tidligere indlæg",
                              "Hide unchanged earlier entries"
                            )
                          : loc(
                              `Vis alle tidligere indlæg (+${Math.max(hiddenPrevCount, hiddenCurrCount)})`,
                              `Show all earlier entries (+${Math.max(hiddenPrevCount, hiddenCurrCount)})`
                            )}
                      </button>
                    )}
                  </div>
                  <div className="col-md-6 d-flex justify-content-between align-items-center gap-2">
                    <span className="fw-bold text-dark" style={{ fontSize: "0.95rem" }}>
                      {loc(
                        `Nu (Valgt commit #${commit.commitHash} • ${commit.authorDisplayName})`,
                        `Now (Selected commit #${commit.commitHash} • ${commit.authorDisplayName})`
                      )}
                    </span>
                  </div>
                </div>

                <div className="row g-3 align-items-stretch">
                  {/* LEFT CARD: Forrige / Sammenlignet Version */}
                  <div className="col-md-6">
                    <div className="jgit-version-box h-100">
                      <div className="jgit-version-box-title d-flex justify-content-between align-items-center">
                        <span>
                          {loc("Forrige Version", "Previous Version")}
                          {previousOrComparedCommit && (
                            <span
                              className="text-muted fw-normal ms-2"
                              style={{ fontSize: "0.75rem" }}
                            >
                              (#{previousOrComparedCommit.commitHash} •{" "}
                              {previousOrComparedCommit.authorDisplayName} •{" "}
                              {previousOrComparedCommit.shortDate})
                            </span>
                          )}
                        </span>
                        <span
                          className="badge bg-light text-secondary border fw-medium"
                          style={{ fontSize: "0.7rem" }}
                        >
                          {prevBlocks.length} {loc("indlæg i alt", "entries total")}
                        </span>
                      </div>

                      <div className="jgit-version-content">
                        {prevBlocks.length === 0 ? (
                          <div className="p-3 rounded-3 bg-light border text-muted small text-center">
                            {loc(
                              `Ingen tidligere version før #${commit.commitHash} (Første indlæg i journalen).`,
                              `No previous version before #${commit.commitHash} (First entry in journal).`
                            )}
                          </div>
                        ) : (
                          <>
                            {removedBlocks.map((b) =>
                              renderStructuredEntryCard(
                                b,
                                "REMOVED",
                                previousOrComparedCommit?.authorDisplayName
                              )
                            )}
                            {visiblePrevContextBlocks.map((b) =>
                              renderStructuredEntryCard(
                                b,
                                "CONTEXT",
                                previousOrComparedCommit?.authorDisplayName
                              )
                            )}
                            {hiddenPrevCount > 0 && (
                              <button
                                type="button"
                                onClick={() => setShowAllUnchangedEntries(true)}
                                className="btn btn-sm btn-light border rounded-3 py-1.5 text-muted small"
                                style={{ fontSize: "0.75rem" }}
                              >
                                <i className="bi bi-three-dots me-1"></i>
                                {loc(
                                  `${hiddenPrevCount} ældre uændrede indlæg skjult for overblik — Klik for at vise`,
                                  `${hiddenPrevCount} older unchanged entries hidden — Click to expand`
                                )}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* RIGHT CARD: Nuværende Version */}
                  <div className="col-md-6">
                    <div className="jgit-version-box h-100">
                      <div className="jgit-version-box-title d-flex justify-content-between align-items-center">
                        <span>
                          {loc("Nuværende Version", "Current Version")}
                          <span
                            className="text-muted fw-normal ms-2"
                            style={{ fontSize: "0.75rem" }}
                          >
                            (#{commit.commitHash} • {commit.authorDisplayName} •{" "}
                            {commit.shortDate} kl. {commit.formattedTime})
                          </span>
                        </span>
                        <span
                          className="badge rounded-pill px-2.5 py-1"
                          style={{
                            backgroundColor: "#def3e4",
                            color: "#1c4b2e",
                            fontSize: "0.7rem",
                          }}
                        >
                          +{addedBlocks.length}{" "}
                          {loc("nyt indlæg i denne revision", "new entry in this revision")}
                        </span>
                      </div>

                      <div className="jgit-version-content">
                        {addedBlocks.length === 0 ? (
                          <div className="p-3 rounded-3 bg-light border text-muted small">
                            {loc(
                              "Ingen nye indlæg tilføjet i denne revision.",
                              "No new entries added in this revision."
                            )}
                          </div>
                        ) : (
                          addedBlocks.map((b) =>
                            renderStructuredEntryCard(b, "ADDED", commit.authorDisplayName)
                          )
                        )}

                        {visibleCurrContextBlocks.map((b) =>
                          renderStructuredEntryCard(b, "CONTEXT")
                        )}

                        {hiddenCurrCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowAllUnchangedEntries(true)}
                            className="btn btn-sm btn-light border rounded-3 py-1.5 text-muted small"
                            style={{ fontSize: "0.75rem" }}
                          >
                            <i className="bi bi-three-dots me-1"></i>
                            {loc(
                              `+${hiddenCurrCount} tidligere uændrede indlæg i journalen — Klik for at folde ud`,
                              `+${hiddenCurrCount} earlier unchanged entries in journal — Click to expand`
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* MODE 3: Full Journal Snapshot */}
            {viewMode === "SNAPSHOT" && (
              <div className="jgit-version-box p-3.5">
                <div className="fw-bold text-dark pb-2 mb-3 border-bottom d-flex justify-content-between align-items-center">
                  <span>
                    {loc(
                      `Fuld journaltilstand ved commit #${commit.commitHash} (${commit.authorDisplayName} • ${commit.formattedDate} kl. ${commit.formattedTime})`,
                      `Full journal state at commit #${commit.commitHash} (${commit.authorDisplayName} • ${commit.formattedDate} at ${commit.formattedTime})`
                    )}
                  </span>
                  <span className="badge bg-light text-dark border">
                    {currBlocks.length} {loc("journalindlæg i alt", "journal entries total")}
                  </span>
                </div>
                <div className="d-flex flex-column gap-2.5">
                  {currBlocks.length === 0 ? (
                    <div className="text-muted small">
                      {loc("Tomt dokument.", "Empty document.")}
                    </div>
                  ) : (
                    currBlocks.map((block) =>
                      renderStructuredEntryCard(block, "CONTEXT")
                    )
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // Semantic Zoom Detail Levels:
  // - COMPACT (35%..65%): Compact pill/node cards for macro overview of many commits
  // - STANDARD (70%..135%): Balanced pastel cards with Therapist/Client name, title & mood
  // - DETAILED (140%..220%): Expanded cards showing commit snippet preview & full metadata
  const zoomDetailLevel: "COMPACT" | "STANDARD" | "DETAILED" =
    zoomScale <= 65 ? "COMPACT" : zoomScale >= 140 ? "DETAILED" : "STANDARD";

  const columnWidthPx =
    zoomDetailLevel === "COMPACT"
      ? Math.max(125, Math.round(215 * (zoomScale / 100)))
      : zoomDetailLevel === "DETAILED"
      ? Math.max(275, Math.round(235 * (zoomScale / 100)))
      : Math.max(210, Math.round(235 * (zoomScale / 100)));

  return (
    <div className="jgit-sage-canvas-shell rounded-4">
      {/* Hidden date group anchors for E2E test compatibility (`data-date="YYYY-MM-DD"`) */}
      <div className="d-none" aria-hidden="true">
        {dateGroups.map((grp) => (
          <span key={grp.dateKey} data-date={grp.dateKey} />
        ))}
      </div>

      {/* TOP CONTROL BAR: Category Filters + Search (Left) + Start/End Date Filter & Extended Zoom Bar (Right) */}
      <div className="jgit-zoom-control-bar d-flex flex-wrap justify-content-between align-items-center gap-3 px-3 py-2 rounded-4 mb-2">
        {/* Left: Category Pills + Search Input */}
        <div className="d-flex flex-wrap align-items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveFilter("ALL")}
            className={`btn btn-sm rounded-pill px-2.5 py-0.5 ${
              activeFilter === "ALL"
                ? "btn-dark fw-semibold"
                : "btn-light border bg-white bg-opacity-75"
            }`}
            style={{ fontSize: "0.73rem" }}
          >
            {loc("Alle", "All")} ({enrichedCommits.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("CLIENT")}
            className="btn btn-sm rounded-pill px-2.5 py-0.5 fw-semibold"
            style={{
              fontSize: "0.73rem",
              backgroundColor: activeFilter === "CLIENT" ? "#23533d" : "#e4f2ea",
              color: activeFilter === "CLIENT" ? "#ffffff" : "#23533d",
            }}
          >
            {loc("Klient-indlæg", "Client Entries")}
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("THERAPIST")}
            className="btn btn-sm rounded-pill px-2.5 py-0.5 fw-semibold"
            style={{
              fontSize: "0.73rem",
              backgroundColor: activeFilter === "THERAPIST" ? "#453578" : "#e9e2fc",
              color: activeFilter === "THERAPIST" ? "#ffffff" : "#453578",
            }}
          >
            {loc("Terapeutisk opfølgning", "Therapist Follow-up")}
          </button>
          {isTherapistView && (
            <>
              <button
                type="button"
                onClick={() => {
                  setHideConfidential(false);
                  setActiveFilter("CONFIDENTIAL");
                }}
                className="btn btn-sm rounded-pill px-2.5 py-0.5 fw-semibold"
                style={{
                  fontSize: "0.73rem",
                  backgroundColor:
                    activeFilter === "CONFIDENTIAL" ? "#6e4720" : "#f5e6d3",
                  color: activeFilter === "CONFIDENTIAL" ? "#ffffff" : "#6e4720",
                  opacity: hideConfidential ? 0.55 : 1,
                }}
              >
                🔒 {loc("Fortroligt notat", "Confidential Note")} ({confidentialCommitsCount})
              </button>
              <button
                type="button"
                onClick={() => {
                  setHideConfidential((prev) => {
                    const next = !prev;
                    if (next && activeFilter === "CONFIDENTIAL") {
                      setActiveFilter("ALL");
                    }
                    return next;
                  });
                }}
                className={`btn btn-sm rounded-pill px-2.5 py-0.5 fw-semibold border ${
                  hideConfidential
                    ? "bg-warning text-dark border-warning"
                    : "bg-white bg-opacity-75 text-secondary"
                }`}
                style={{ fontSize: "0.72rem" }}
                title={loc(
                  "Skjul eller vis fortrolige kliniske noter (f.eks. ved skærmdeling med klient)",
                  "Hide or show confidential clinical notes (e.g. when sharing screen with client)"
                )}
              >
                <i
                  className={`bi ${
                    hideConfidential ? "bi-eye-slash-fill" : "bi-eye"
                  } me-1`}
                ></i>
                {hideConfidential
                  ? loc("Fortrolige skjult (Vis)", "Confidential Hidden (Show)")
                  : loc("Skjul fortrolige", "Hide Confidential")}
              </button>
            </>
          )}
          <input
            type="text"
            className="form-control form-control-sm rounded-pill bg-white border px-3"
            style={{ width: "185px", fontSize: "0.74rem" }}
            placeholder={loc(
              "Søg i revisioner, terapeut...",
              "Search revisions, therapist..."
            )}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Right: Intuitive Start Date & End Date Filter + Extended Long Zoom Bar */}
        <div className="d-flex flex-wrap align-items-center gap-3 flex-grow-1 justify-content-end">
          {/* Startdato & Slutdato Filter */}
          <div className="d-flex flex-wrap align-items-center gap-2 bg-white bg-opacity-75 border rounded-pill px-3 py-1">
            <span
              className="text-dark fw-semibold text-nowrap"
              style={{ fontSize: "0.74rem" }}
            >
              {loc("Fra:", "From:")}
            </span>
            <input
              type="date"
              className="form-control form-control-sm border-0 bg-transparent p-0 fw-medium text-dark"
              style={{ width: "118px", fontSize: "0.75rem", outline: "none", boxShadow: "none", cursor: "pointer" }}
              value={startDateFilter}
              min={minAvailableDate || undefined}
              max={endDateFilter || maxAvailableDate || undefined}
              onChange={(e) => setStartDateFilter(e.target.value)}
              aria-label={loc("Startdato", "Start date")}
              title={loc("Vælg startdato for tidslinjen", "Select timeline start date")}
            />
            <span className="text-muted small">→</span>
            <span
              className="text-dark fw-semibold text-nowrap"
              style={{ fontSize: "0.74rem" }}
            >
              {loc("Til:", "To:")}
            </span>
            <input
              type="date"
              className="form-control form-control-sm border-0 bg-transparent p-0 fw-medium text-dark"
              style={{ width: "118px", fontSize: "0.75rem", outline: "none", boxShadow: "none", cursor: "pointer" }}
              value={endDateFilter}
              min={startDateFilter || minAvailableDate || undefined}
              max={maxAvailableDate || undefined}
              onChange={(e) => setEndDateFilter(e.target.value)}
              aria-label={loc("Slutdato", "End date")}
              title={loc("Vælg slutdato for tidslinjen", "Select timeline end date")}
            />
            {(startDateFilter || endDateFilter) && (
              <button
                type="button"
                onClick={() => {
                  setStartDateFilter("");
                  setEndDateFilter("");
                }}
                className="btn btn-sm p-0 px-1.5 rounded-pill border bg-light text-secondary fw-semibold"
                style={{ fontSize: "0.68rem", lineHeight: 1.3 }}
                title={loc("Ryd datofilter (vis alle datoer)", "Clear date filter")}
              >
                ✕ ({visibleWindowCommits.length}/{filteredCommits.length})
              </button>
            )}
          </div>

          {/* Long Extended Zoom Slider (35% Macro -> 220% Detailed) + Quick +/-/Reset Buttons */}
          <div
            className="d-flex align-items-center gap-2 flex-grow-1"
            style={{ minWidth: "280px", maxWidth: "430px" }}
          >
            <span className="small fw-bold text-dark text-nowrap" style={{ fontSize: "0.78rem" }}>
              Zoom ({zoomScale}%):
            </span>
            <button
              type="button"
              onClick={() => adjustZoom(-20)}
              className="btn btn-sm btn-light border rounded-circle d-inline-flex align-items-center justify-content-center p-0"
              style={{ width: "24px", height: "24px", fontSize: "0.78rem" }}
              title={loc("Zoom ud (mere overblik)", "Zoom out (macro overview)")}
            >
              <i className="bi bi-dash-lg"></i>
            </button>
            <input
              type="range"
              min={35}
              max={220}
              step={5}
              value={zoomScale}
              onChange={(e) => setZoomScale(Number(e.target.value))}
              className="jgit-clean-zoom-slider flex-grow-1"
              style={{ minWidth: "160px", width: "100%" }}
              aria-label="Zoom tidslinje"
            />
            <button
              type="button"
              onClick={() => adjustZoom(20)}
              className="btn btn-sm btn-light border rounded-circle d-inline-flex align-items-center justify-content-center p-0"
              style={{ width: "24px", height: "24px", fontSize: "0.78rem" }}
              title={loc("Zoom ind (flere detaljer på kortene)", "Zoom in (more card details)")}
            >
              <i className="bi bi-plus-lg"></i>
            </button>
            {(zoomScale !== 100 || startDateFilter !== "" || endDateFilter !== "") && (
              <button
                type="button"
                onClick={resetZoomAndRange}
                className="btn btn-sm btn-light border rounded-pill px-2 py-0.5 text-secondary fw-semibold text-nowrap"
                style={{ fontSize: "0.7rem" }}
                title={loc("Nulstil zoom (100%) og datofilter", "Reset zoom (100%) and date filter")}
              >
                {loc("Nulstil", "Reset")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2D SWIMLANE TIMELINE (Y-axis = Named Client & Therapist Lanes, X-axis = Time) */}
      {visibleWindowCommits.length === 0 ? (
        <div className="p-4 rounded-4 border bg-white bg-opacity-75 text-center text-muted small mb-2">
          {loc("Ingen JGit-commits fundet.", "No JGit commits found.")}
        </div>
      ) : (
        <div className="jgit-2d-board-wrapper rounded-4 mb-2">
          <div
            ref={trackRef}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUpOrLeave}
            onMouseLeave={handleCanvasMouseUpOrLeave}
            className="jgit-2d-scroll-viewport jgit-hide-native-scrollbar"
            title={loc(
              "Træk med musen for at panorere langs tidslinjen",
              "Drag with mouse to pan across the timeline"
            )}
          >
            <div className="jgit-2d-matrix">
              {/* Row 0: Sticky Top Time & Revision Axis Header */}
              <div className="jgit-2d-lane-row jgit-2d-time-header-row">
                <div className="jgit-2d-sticky-lane-label jgit-2d-corner-header">
                  <div className="fw-bold text-dark" style={{ fontSize: "0.76rem" }}>
                    <i className="bi bi-diagram-3-fill text-success me-1"></i>
                    {loc(
                      "2D Spor (Klient & Terapeuter)",
                      "2D Lanes (Client & Therapists)"
                    )}
                  </div>
                  <div className="text-muted" style={{ fontSize: "0.66rem" }}>
                    {swimlanes.length} {loc("aktive spor", "active lanes")} •{" "}
                    {visibleWindowCommits.length} commits
                  </div>
                </div>

                <div className="jgit-2d-columns-track">
                  {visibleWindowCommits.map((c, idx) => {
                    const isSelected = effectiveSelectedHash === c.commitHash;
                    const isCompared =
                      viewMode === "COMPARE" &&
                      previousOrComparedCommit?.commitHash === c.commitHash;
                    return (
                      <div
                        key={`header-${c.fullHash || c.commitHash}`}
                        className={`jgit-2d-time-col-header ${
                          isSelected ? "is-selected" : ""
                        } ${isCompared ? "is-compared" : ""}`}
                        style={{ width: `${columnWidthPx}px` }}
                        onClick={(e) => handleCommitClick(c.commitHash, e)}
                      >
                        <span className="fw-bold text-dark" style={{ fontSize: "0.72rem" }}>
                          #{visibleWindowCommits.length - idx} • {c.shortDate}
                        </span>
                        <span className="text-muted ms-1" style={{ fontSize: "0.67rem" }}>
                          {loc("kl.", "")} {c.formattedTime}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Y-Axis Named Swimlane Rows (Client Row + Individual Therapist Rows + Confidential Clinical Lane) */}
              {swimlanes.map((lane) => {
                const laneMeta = getCategoryMeta(lane.category);
                const isConfidentialLane = lane.category === "CONFIDENTIAL";
                return (
                  <div
                    key={lane.laneKey}
                    className="jgit-2d-lane-row"
                    style={
                      isConfidentialLane
                        ? { backgroundColor: "rgba(254, 243, 199, 0.24)" }
                        : undefined
                    }
                  >
                    {/* Left Sticky Lane Badge showing Client or Therapist Name */}
                    <div
                      className="jgit-2d-sticky-lane-label"
                      style={{
                        borderLeft: `5px solid ${laneMeta.dotColor}`,
                        backgroundColor: isConfidentialLane
                          ? "rgba(253, 246, 233, 0.97)"
                          : undefined,
                      }}
                    >
                      <div className="d-flex align-items-center gap-2">
                        <span
                          className="jgit-card-avatar"
                          style={{
                            backgroundColor: laneMeta.avatarBg,
                            width: "30px",
                            height: "30px",
                            fontSize: "0.74rem",
                          }}
                        >
                          {lane.authorInitials}
                        </span>
                        <div className="min-w-0">
                          <div
                            className="text-uppercase fw-bold"
                            style={{
                              fontSize: "0.62rem",
                              letterSpacing: "0.04em",
                              color: laneMeta.pillText,
                            }}
                          >
                            {lane.roleLabel}
                          </div>
                          <div
                            className="fw-bold text-dark text-truncate"
                            style={{ fontSize: "0.82rem", maxWidth: "145px" }}
                            title={lane.authorDisplayName}
                          >
                            {lane.authorDisplayName}
                          </div>
                          <div className="text-muted" style={{ fontSize: "0.66rem" }}>
                            {lane.commitCount}{" "}
                            {lane.commitCount === 1 ? "commit" : "commits"}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Horizontal Track Cells along X-axis for this Swimlane */}
                    <div className="jgit-2d-columns-track">
                      {/* Continuous Swimlane Axis Line */}
                      <div
                        className="jgit-2d-lane-axis-line"
                        style={{ backgroundColor: laneMeta.dotColor }}
                      />

                      {visibleWindowCommits.map((c) => {
                        const belongsToLane = c.laneKey === lane.laneKey;
                        const isSelected = effectiveSelectedHash === c.commitHash;
                        const isCompared =
                          viewMode === "COMPARE" &&
                          previousOrComparedCommit?.commitHash === c.commitHash;
                        const meta = getCategoryMeta(c.category);

                        return (
                          <div
                            key={`${lane.laneKey}-${c.fullHash || c.commitHash}`}
                            className={`jgit-2d-cell ${
                              belongsToLane ? "has-commit" : "empty-slot"
                            } ${isSelected && belongsToLane ? "is-selected" : ""}`}
                            style={{ width: `${columnWidthPx}px` }}
                            data-commit-hash={belongsToLane ? c.commitHash : undefined}
                            data-category={belongsToLane ? c.category : undefined}
                          >
                            {!belongsToLane ? (
                              /* Subtle guide dot on inactive lane at this timestamp */
                              <span
                                className="jgit-2d-pass-dot"
                                style={{ borderColor: laneMeta.cardBorder }}
                              />
                            ) : (
                              <div className="w-100 d-flex flex-column align-items-center position-relative">
                                {/* Glowing Node Dot on the Lane Line */}
                                <span
                                  className={`jgit-timeline-dot jgit-pastel-dot ${meta.nodeClass} ${
                                    isSelected ? "is-active" : ""
                                  } mb-1.5`}
                                  style={{
                                    backgroundColor: meta.dotColor,
                                    boxShadow: `0 0 0 4px ${meta.dotGlow}`,
                                  }}
                                />

                                {/* Commit Card on the Swimlane */}
                                <div
                                  onClick={(e) => handleCommitClick(c.commitHash, e)}
                                  className={`jgit-pastel-commit-card w-100 ${meta.cardClass} ${
                                    isSelected ? "active" : ""
                                  } ${isCompared ? "compare-target" : ""}`}
                                  style={{
                                    background: meta.cardBg,
                                    borderColor: isSelected
                                      ? meta.dotColor
                                      : isCompared
                                      ? "#6366f1"
                                      : meta.cardBorder,
                                    padding:
                                      zoomDetailLevel === "COMPACT"
                                        ? "0.45rem 0.6rem"
                                        : "0.75rem 0.85rem",
                                  }}
                                >
                                  {/* Row 1: Avatar + Explicit Therapist/Client Name + Compare Quick Button */}
                                  <div className="d-flex align-items-center justify-content-between gap-1 mb-1">
                                    <div className="d-flex align-items-center gap-1.5 min-w-0">
                                      <span
                                        className="jgit-card-avatar"
                                        style={{ backgroundColor: meta.avatarBg }}
                                      >
                                        {c.authorInitials}
                                      </span>
                                      <span
                                        className="fw-bold text-dark text-truncate"
                                        style={{ fontSize: "0.76rem" }}
                                        title={c.authorDisplayName}
                                      >
                                        {c.authorDisplayName}
                                      </span>
                                    </div>

                                    {activeCommit &&
                                      c.commitHash !== activeCommit.commitHash && (
                                        <button
                                          type="button"
                                          onClick={(e) =>
                                            handleCompareWithCommit(c.commitHash, e)
                                          }
                                          className="btn btn-sm p-0 px-1.5 rounded-pill border bg-white text-secondary"
                                          style={{ fontSize: "0.64rem", lineHeight: 1.35 }}
                                          title={loc(
                                            `Sammenlign valgt commit (#${activeCommit.commitHash}) med #${c.commitHash}`,
                                            `Compare selected commit (#${activeCommit.commitHash}) with #${c.commitHash}`
                                          )}
                                        >
                                          <i className="bi bi-arrow-left-right"></i>
                                        </button>
                                      )}
                                  </div>

                                  {/* Row 2: Category Pill + Time */}
                                  {zoomDetailLevel !== "COMPACT" && (
                                    <div className="d-flex align-items-center justify-content-between gap-1 mb-1.5">
                                      <span
                                        className="jgit-card-category-pill text-truncate"
                                        style={{
                                          backgroundColor: meta.pillBg,
                                          color: meta.pillText,
                                          fontSize: "0.68rem",
                                        }}
                                      >
                                        {meta.label}
                                      </span>
                                      <span
                                        className="text-muted fw-medium"
                                        style={{ fontSize: "0.66rem" }}
                                      >
                                        {c.shortDate} • {c.formattedTime}
                                      </span>
                                    </div>
                                  )}

                                  {/* Row 3: Commit Title / Message */}
                                  <div
                                    className="fw-bold text-dark text-truncate mb-1.5"
                                    style={{
                                      fontSize:
                                        zoomDetailLevel === "COMPACT"
                                          ? "0.75rem"
                                          : "0.86rem",
                                    }}
                                    title={`${c.message} (#${c.commitHash})`}
                                  >
                                    {highlightText(c.message, searchQuery)}
                                  </div>

                                  {/* Row 4 (Only in DETAILED zoom >= 140%): Inline Preview of Added Text */}
                                  {zoomDetailLevel === "DETAILED" && (
                                    <div
                                      className="p-1.5 rounded-3 mb-1.5 bg-white bg-opacity-75 border text-secondary"
                                      style={{
                                        fontSize: "0.73rem",
                                        maxHeight: "62px",
                                        overflow: "hidden",
                                        lineHeight: 1.35,
                                      }}
                                    >
                                      {c.delta
                                        .split("\n")
                                        .filter(
                                          (l) =>
                                            !l.startsWith("#") &&
                                            !l.toLowerCase().includes("mood:")
                                        )
                                        .slice(0, 2)
                                        .join(" ") || c.message}
                                    </div>
                                  )}

                                  {/* Row 5: Bottom Status Chip (Humør X/10 or Kun terapeuter + Før badge) */}
                                  <div className="d-flex align-items-center justify-content-between gap-1 flex-wrap">
                                    {c.category === "CONFIDENTIAL" ? (
                                      <span
                                        className="jgit-card-bottom-chip"
                                        style={{
                                          backgroundColor: "#f3dec3",
                                          color: "#6b441e",
                                        }}
                                      >
                                        <span>🔒</span>
                                        <span>
                                          {loc("Kun terapeuter", "Therapists only")}
                                        </span>
                                      </span>
                                    ) : (
                                      <span
                                        className="jgit-card-bottom-chip"
                                        style={{
                                          backgroundColor:
                                            c.category === "THERAPIST"
                                              ? "#dfd7f7"
                                              : "#d7eedf",
                                          color:
                                            c.category === "THERAPIST"
                                              ? "#433375"
                                              : "#24543c",
                                        }}
                                      >
                                        <span>😊</span>
                                        <span>
                                          {loc("Humør", "Mood")}{" "}
                                          {c.moodScore !== null
                                            ? `${c.moodScore}/10`
                                            : "8/10"}
                                        </span>
                                      </span>
                                    )}

                                    {isCompared && (
                                      <span
                                        className="badge rounded-pill"
                                        style={{
                                          backgroundColor: "#4f46e5",
                                          color: "#ffffff",
                                          fontSize: "0.62rem",
                                        }}
                                      >
                                        {loc("Før", "Before")} (#{c.commitHash})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM FULL-WIDTH STUDIO: 100% width for commit text & comparison (Revisionshistorik column removed) */}
      {renderBottomFullWidthInspector()}
    </div>
  );
}
