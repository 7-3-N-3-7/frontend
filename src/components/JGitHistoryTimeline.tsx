"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Dialog } from "@base-ui/react/dialog";

export type JGitCommitCategory = "CLIENT" | "THERAPIST" | "CONFIDENTIAL" | "APPOINTMENT";

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
  referencedCommitHash?: string | null;
  referencedAppointment?: string | null;
  laneKey: string;
  laneRoleLabel: string;
}

export interface JGitHistoryTimelineProps {
  commits: any[];
  isTherapistView: boolean;
  splitView?: boolean;
  selectedCommitHash?: string | null;
  onSelectCommit?: (commitHash: string) => void;
  onOpenAppointment?: (appointmentRef: string) => void;
  locale?: string;
  toolbarActions?: React.ReactNode;
  underToolbar?: React.ReactNode;
  isFilterModalOpen?: boolean;
  onFilterModalOpenChange?: (open: boolean) => void;
  onActiveFiltersCountChange?: (count: number) => void;
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

export function cleanAppointmentReference(raw?: string | null): string {
  if (!raw) return "";
  let clean = raw.trim();

  // If there are parentheses containing title/date info, extract what's inside
  const parenMatch = clean.match(/\(([^)]+)\)/);
  if (parenMatch) {
    clean = parenMatch[1].trim();
  }

  // Remove any raw UUIDs (8-4-4-4-12 hex chars) anywhere in the string
  clean = clean.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "");

  // Strip brackets, parentheses, leading/trailing punctuation and hashes
  clean = clean.replace(/[\[\]\(\)]/g, " ").trim();
  clean = clean.replace(/^[#:\s-]+/, "").replace(/[#:\s-]+$/, "").trim();

  // Prettify ISO date (e.g. 2026-10-14) if present
  clean = clean.replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, y, m, d) => {
    const months = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    const mIdx = parseInt(m, 10) - 1;
    const mStr = months[mIdx] || m;
    return `${parseInt(d, 10)}. ${mStr}. ${y}`;
  });

  // Prettify time like kl. 10:0 -> kl. 10:00
  clean = clean.replace(/kl\.\s*(\d{1,2}):(\d)(?!\d)/gi, "kl. $1:$20");

  // Collapse consecutive whitespaces
  clean = clean.replace(/\s{2,}/g, " ").trim();

  return clean || "Aftale";
}

function classifyCommit(
  message: string,
  delta: string,
  author: string
): JGitCommitCategory {
  const msgLower = (message || "").toLowerCase();
  const deltaUpper = delta || "";

  if (
    msgLower.startsWith("aftale") ||
    msgLower.startsWith("appointment") ||
    msgLower.includes("aftale oprettet") ||
    msgLower.includes("aftale ombooket") ||
    msgLower.includes("aftale aflyst") ||
    deltaUpper.includes("## Aftale")
  ) {
    return "APPOINTMENT";
  }

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

  if (category === "APPOINTMENT") {
    return clean || "Klinik Booking";
  }

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

function parseCommitMetadata(delta: string, snapshot: string, message?: string): {
  moodScore: number | null;
  isShared: boolean | null;
  referencedCommitHash: string | null;
  referencedAppointment: string | null;
} {
  const source = `${message || ""}\n${delta}\n${snapshot}`;
  let moodScore: number | null = null;
  let isShared: boolean | null = null;
  let referencedCommitHash: string | null = null;
  let referencedAppointment: string | null = null;

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

  // Parse referenced commit (Git trailer or content tag)
  const commitRefMatch = source.match(/(?:Refs-Commit|Tilknyttet\s*commit|Opfølgning\s*på\s*commit)\s*:\s*#?([a-f0-9]{6,40})/i);
  if (commitRefMatch) {
    referencedCommitHash = commitRefMatch[1];
  }

  // Parse referenced appointment (Git trailer or content tag)
  const aptRefMatch = source.match(/(?:Refs-Appointment|Tilknyttet\s*aftale)\s*:\s*([^\n\r\]]+)/i);
  if (aptRefMatch) {
    referencedAppointment = aptRefMatch[1].trim();
  }

  return { moodScore, isShared, referencedCommitHash, referencedAppointment };
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
  onOpenAppointment,
  locale = "da",
  toolbarActions,
  underToolbar,
  isFilterModalOpen,
  onFilterModalOpenChange,
  onActiveFiltersCountChange,
}: JGitHistoryTimelineProps) {
  const isEn = locale === "en";
  const loc = useCallback(
    (daText: string, enText: string) => (isEn ? enText : daText),
    [isEn]
  );
  const [activeFilter, setActiveFilter] = useState<JGitCommitCategory | "ALL">("ALL");
  const [hideConfidential, setHideConfidential] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"DELTA" | "COMPARE" | "SNAPSHOT">("DELTA");
  const [compareCommitHash, setCompareCommitHash] = useState<string | null>(null);

  // Controlled / Uncontrolled modal state
  const [internalModalOpen, setInternalModalOpen] = useState(false);
  const isModalOpen = isFilterModalOpen !== undefined ? isFilterModalOpen : internalModalOpen;
  const setModalOpen = useCallback(
    (open: boolean) => {
      setInternalModalOpen(open);
      onFilterModalOpenChange?.(open);
    },
    [onFilterModalOpenChange]
  );

  // Modal active tab: "SWIMLANES" | "FILTERS"
  const [modalActiveTab, setModalActiveTab] = useState<"SWIMLANES" | "FILTERS">("SWIMLANES");

  // Swimlane customization states
  const [disabledLaneKeys, setDisabledLaneKeys] = useState<string[]>([]);
  const [maxLanes, setMaxLanes] = useState<number | null>(null); // null = unlimited/all
  const [hideEmptyLanes, setHideEmptyLanes] = useState<boolean>(false);

  // Mood filter state
  const [moodFilter, setMoodFilter] = useState<"ALL" | "LOW" | "MEDIUM" | "HIGH">("ALL");

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

      // Strict client privacy: appointments are private and personal to the client.
      // Therapists must never see raw appointment commits or the appointment swimlane.
      if (isTherapistView && category === "APPOINTMENT") {
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
      const { moodScore, isShared, referencedCommitHash, referencedAppointment } =
        parseCommitMetadata(deltaStr, c.snapshot || "", c.message || "");

      let rawMessage = String(c.message || "Journal revision")
        .replace(/^Added\s+journal\s+entry\s*:\s*/i, "")
        .trim();

      if (category === "THERAPIST" || category === "CONFIDENTIAL") {
        if (/^clinical\s+note\b/i.test(rawMessage)) {
          rawMessage = loc("Fortroligt klinisk notat", "Clinical note");
        } else {
          rawMessage = rawMessage
            .replace(/\s*\([^)]*?(?:terapeut|behandler|clinic|aps|kbh|bo\s+jensen|mette\s+lind|læge|dr\.|delt|fortrolig)[^)]*?\)/gi, "")
            .replace(/\s*\([A-ZÆØÅa-zæøå\s.+-]{2,50}\)$/, "")
            .replace(/\s*by\s+[^(\n\r]+(?:\(.*?\))?/gi, "")
            .replace(/\s*[•|]\s*[^(\n\r]+(?:\(.*?\))?/gi, "")
            .trim();
        }
        if (!rawMessage || rawMessage.toLowerCase() === "clinical note") {
          rawMessage =
            category === "CONFIDENTIAL"
              ? loc("Fortroligt klinisk notat", "Confidential clinical note")
              : loc("Terapeutisk opfølgning", "Therapeutic follow-up");
        }
      }

      const canonicalAuthorKey =
        category === "APPOINTMENT"
          ? "appointment_main"
          : category === "CLIENT"
          ? "client_main"
          : "therapist_main";

      const laneKey =
        category === "APPOINTMENT"
          ? `APPOINTMENT::${canonicalAuthorKey}`
          : category === "CLIENT"
          ? `CLIENT::${canonicalAuthorKey}`
          : category === "CONFIDENTIAL"
          ? `CONFIDENTIAL::${canonicalAuthorKey}`
          : `THERAPIST::${canonicalAuthorKey}`;

      const laneRoleLabel =
        category === "APPOINTMENT"
          ? loc("📅 Aftaler & Kalender", "📅 Appointments & Calendar")
          : category === "CLIENT"
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
        referencedCommitHash,
        referencedAppointment,
        laneKey,
        laneRoleLabel,
      });
    }
    return list;
  }, [commits, isTherapistView, locale, loc]);

  // 1b. All possible swimlanes based on enrichedCommits
  const allAvailableLanes = useMemo<SwimlaneRow[]>(() => {
    const laneMap = new Map<string, SwimlaneRow>();
    for (const c of enrichedCommits) {
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

    const orderWeight = (cat: JGitCommitCategory) =>
      cat === "APPOINTMENT" ? 0 : cat === "CLIENT" ? 1 : cat === "THERAPIST" ? 2 : 3;

    return Array.from(laneMap.values()).sort((a, b) => {
      const wDiff = orderWeight(a.category) - orderWeight(b.category);
      if (wDiff !== 0) return wDiff;
      return a.authorDisplayName.localeCompare(b.authorDisplayName);
    });
  }, [enrichedCommits]);

  // 2. Apply category filter, confidential screen-share toggle, mood score & search query
  const filteredCommits = useMemo(() => {
    return enrichedCommits.filter((c) => {
      if (hideConfidential && c.category === "CONFIDENTIAL") {
        return false;
      }
      if (activeFilter !== "ALL" && c.category !== activeFilter) {
        return false;
      }
      if (moodFilter !== "ALL") {
        if (c.moodScore === null) return false;
        if (moodFilter === "LOW" && (c.moodScore < 1 || c.moodScore > 3)) return false;
        if (moodFilter === "MEDIUM" && (c.moodScore < 4 || c.moodScore > 7)) return false;
        if (moodFilter === "HIGH" && (c.moodScore < 8 || c.moodScore > 10)) return false;
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
  }, [enrichedCommits, activeFilter, hideConfidential, moodFilter, searchQuery]);

  // 2b. Apply Start Date & End Date filter
  const dateFilteredCommits = useMemo(() => {
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

  // Build 2D Y-Axis Swimlanes taking into account user selections (disabledLaneKeys, maxLanes, hideEmptyLanes)
  const swimlanes = useMemo<SwimlaneRow[]>(() => {
    const activeLanesMap = new Map<string, number>();
    for (const c of dateFilteredCommits) {
      activeLanesMap.set(c.laneKey, (activeLanesMap.get(c.laneKey) || 0) + 1);
    }

    let list: SwimlaneRow[] = allAvailableLanes.map((lane) => ({
      ...lane,
      commitCount: activeLanesMap.get(lane.laneKey) || 0,
    }));

    if (hideEmptyLanes) {
      list = list.filter((lane) => lane.commitCount > 0);
    }

    if (disabledLaneKeys.length > 0) {
      list = list.filter((lane) => !disabledLaneKeys.includes(lane.laneKey));
    }

    const orderWeight = (cat: JGitCommitCategory) =>
      cat === "APPOINTMENT" ? 0 : cat === "CLIENT" ? 1 : cat === "THERAPIST" ? 2 : 3;

    list.sort((a, b) => {
      const wDiff = orderWeight(a.category) - orderWeight(b.category);
      if (wDiff !== 0) return wDiff;
      return a.authorDisplayName.localeCompare(b.authorDisplayName);
    });

    if (typeof maxLanes === "number" && maxLanes > 0) {
      list = list.slice(0, maxLanes);
    }

    return list;
  }, [dateFilteredCommits, allAvailableLanes, hideEmptyLanes, disabledLaneKeys, maxLanes]);

  // Visible commits along the X-axis: only commits that belong to currently active/visible swimlanes
  const visibleWindowCommits = useMemo(() => {
    const activeLaneKeys = new Set(swimlanes.map((l) => l.laneKey));
    return dateFilteredCommits.filter((c) => activeLaneKeys.has(c.laneKey));
  }, [dateFilteredCommits, swimlanes]);

  // Active filters counter
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (activeFilter !== "ALL") count++;
    if (hideConfidential) count++;
    if (moodFilter !== "ALL") count++;
    if (startDateFilter || endDateFilter) count++;
    if (disabledLaneKeys.length > 0 || maxLanes !== null || hideEmptyLanes) count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [activeFilter, hideConfidential, moodFilter, startDateFilter, endDateFilter, disabledLaneKeys, maxLanes, hideEmptyLanes, searchQuery]);

  useEffect(() => {
    onActiveFiltersCountChange?.(activeFiltersCount);
  }, [activeFiltersCount, onActiveFiltersCountChange]);

  const setQuickDateRange = useCallback((days: number | "ALL") => {
    if (days === "ALL") {
      setStartDateFilter("");
      setEndDateFilter("");
      return;
    }
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDateFilter(start.toISOString().slice(0, 10));
    setEndDateFilter(end.toISOString().slice(0, 10));
  }, []);

  const resetAllFilters = useCallback(() => {
    setActiveFilter("ALL");
    setHideConfidential(false);
    setMoodFilter("ALL");
    setStartDateFilter("");
    setEndDateFilter("");
    setDisabledLaneKeys([]);
    setMaxLanes(null);
    setHideEmptyLanes(false);
    setSearchQuery("");
  }, []);

  const toggleLaneKey = useCallback((laneKey: string) => {
    setDisabledLaneKeys((prev) =>
      prev.includes(laneKey) ? prev.filter((k) => k !== laneKey) : [...prev, laneKey]
    );
  }, []);

  const applySwimlanePreset = useCallback(
    (preset: "ALL" | "CLIENT_ONLY" | "THERAPISTS_ONLY") => {
      if (preset === "ALL") {
        setDisabledLaneKeys([]);
        setMaxLanes(null);
      } else if (preset === "CLIENT_ONLY") {
        const toDisable = allAvailableLanes
          .filter((l) => l.category !== "CLIENT")
          .map((l) => l.laneKey);
        setDisabledLaneKeys(toDisable);
        setMaxLanes(null);
      } else if (preset === "THERAPISTS_ONLY") {
        const toDisable = allAvailableLanes
          .filter((l) => l.category === "CLIENT")
          .map((l) => l.laneKey);
        setDisabledLaneKeys(toDisable);
        setMaxLanes(null);
      }
    },
    [allAvailableLanes]
  );

  const effectiveSelectedHash = useMemo(() => {
    if (visibleWindowCommits.length === 0) return null;
    if (internalSelectedHash === "__COLLAPSED__") return null;
    if (internalSelectedHash) {
      const matched = visibleWindowCommits.find(
        (c) =>
          c.commitHash === internalSelectedHash ||
          c.fullHash === internalSelectedHash ||
          (internalSelectedHash.length >= 7 && c.fullHash?.startsWith(internalSelectedHash)) ||
          (c.commitHash && internalSelectedHash.startsWith(c.commitHash))
      );
      if (matched) {
        return matched.commitHash;
      }
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
    if (!trackRef.current || !hash) return;
    const container = trackRef.current;
    const shortHash = hash.slice(0, 8);
    const targetEl = container.querySelector<HTMLElement>(
      `[data-commit-hash="${hash}"], [data-commit-hash="${shortHash}"], [data-commit-fullhash="${hash}"]`
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

  // When selectedCommitHash prop is provided or changes from parent, ensure selection is updated
  const prevSelectedCommitHashRef = useRef<string | null | undefined>(selectedCommitHash);
  useEffect(() => {
    if (selectedCommitHash && selectedCommitHash !== prevSelectedCommitHashRef.current) {
      prevSelectedCommitHashRef.current = selectedCommitHash;
      setInternalSelectedHash(selectedCommitHash);
      const match = enrichedCommits.find(
        (c) =>
          c.commitHash === selectedCommitHash ||
          c.fullHash === selectedCommitHash ||
          (selectedCommitHash.length >= 7 && c.fullHash?.startsWith(selectedCommitHash)) ||
          (c.commitHash && selectedCommitHash.startsWith(c.commitHash))
      );
      if (match) {
        if (activeFilter !== "ALL" && match.category !== activeFilter) {
          setActiveFilter("ALL");
        }
        if (match.category === "CONFIDENTIAL") {
          setHideConfidential(false);
        }
      }
    } else if (!selectedCommitHash) {
      prevSelectedCommitHashRef.current = selectedCommitHash;
    }
  }, [selectedCommitHash, enrichedCommits, activeFilter]);

  // Smooth scroll horizontally to the selected commit whenever effective selection changes
  useEffect(() => {
    if (effectiveSelectedHash) {
      const timer = setTimeout(() => {
        scrollCommitIntoHorizontalView(effectiveSelectedHash);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [effectiveSelectedHash, scrollCommitIntoHorizontalView]);

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

  const toggleHideConfidential = useCallback(() => {
    setHideConfidential((prev) => {
      const nextState = !prev;
      if (nextState) {
        if (activeFilter === "CONFIDENTIAL") {
          setActiveFilter("ALL");
        }
        const firstNonConfidential = enrichedCommits.find((c) => c.category !== "CONFIDENTIAL");
        if (firstNonConfidential) {
          selectCommitAndNotify(firstNonConfidential.commitHash);
        }
      }
      return nextState;
    });
  }, [activeFilter, enrichedCommits, selectCommitAndNotify]);

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
      case "APPOINTMENT":
        return {
          label: loc("📅 Aftale / Kalender", "📅 Appointment / Calendar"),
          pillBg: "#e0f2fe",
          pillText: "#0369a1",
          cardBg: "linear-gradient(145deg, #f0f9ff 0%, #e0f2fe 100%)",
          cardBorder: "#bae6fd",
          dotColor: "#0284c7",
          dotGlow: "rgba(2, 132, 199, 0.45)",
          avatarBg: "#0369a1",
          cardClass: "cat-appointment",
          nodeClass: "node-appointment",
        };
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
    referencedCommitHash?: string | null;
    referencedAppointment?: string | null;
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
          firstLine.toLowerCase().startsWith("## aftale") ||
          firstLine.toLowerCase().startsWith("# aftale") ||
          rawBlock.toLowerCase().includes("aftale oprettet") ||
          rawBlock.toLowerCase().includes("aftale ombooket") ||
          rawBlock.toLowerCase().includes("aftale aflyst")
        ) {
          category = "APPOINTMENT";
        } else if (
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
            .replace(/\]$/, "")
            .trim();
        }

        if (category === "CONFIDENTIAL") {
          title = loc("Fortroligt klinisk notat", "Confidential clinical note");
        } else if (category === "THERAPIST") {
          if (title.toLowerCase().includes("opfølgning") || title.toLowerCase().includes("terapeut")) {
            title = loc("Terapeutisk opfølgning", "Therapeutic follow-up");
          } else {
            title = title
              .replace(/\s*\([^)]*?(?:terapeut|behandler|clinic|aps|kbh|bo\s+jensen|mette\s+lind|læge|dr\.|delt|fortrolig)[^)]*?\)/gi, "")
              .replace(/\s*\([A-ZÆØÅa-zæøå\s.+-]{2,50}\)$/, "")
              .replace(/\s*by\s+[^(\n\r]+(?:\(.*?\))?/gi, "")
              .replace(/\s*[•|]\s*[^(\n\r]+(?:\(.*?\))?/gi, "")
              .trim() || loc("Terapeutisk opfølgning", "Therapeutic follow-up");
          }
        }

        let moodScore: number | null = null;
        let sharedLabel: string | null = null;
        let referencedCommitHash: string | null = null;
        let referencedAppointment: string | null = null;
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

          const cRef = line.match(/(?:Refs-Commit|Tilknyttet\s*commit|Opfølgning\s*på\s*commit)\s*:\s*#?([a-f0-9]{6,40})/i);
          if (cRef) {
            referencedCommitHash = cRef[1];
            continue;
          }

          const aRef = line.match(/(?:Refs-Appointment|Tilknyttet\s*aftale|Aftale)\s*:\s*([^\n\r\]]+)/i);
          if (aRef) {
            referencedAppointment = aRef[1].replace(/\]$/, "").trim();
            continue;
          }

          // Filter any trailer lines or raw UUIDs from body lines
          if (line.match(/^(?:Refs-[A-Za-z]+|Commit|Sha|UUID)\s*:/i)) {
            continue;
          }
          const sanitizedLine = line
            .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "")
            .trim();
          if (sanitizedLine || line.trim() === "") {
            bodyLines.push(sanitizedLine || line);
          }
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
          referencedCommitHash,
          referencedAppointment,
          bodyLines,
        };
      }).filter((b) => {
        // Strict client privacy: appointments are private and personal to the client
        if (isTherapistView && b.category === "APPOINTMENT") {
          return false;
        }
        // Strict client privacy: internal medical notes never visible to client
        if (!isTherapistView && b.category === "CONFIDENTIAL") {
          return false;
        }
        // Screen-share privacy: therapist opted to hide confidential clinical notes
        if (isTherapistView && hideConfidential && b.category === "CONFIDENTIAL") {
          return false;
        }
        return true;
      });
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

        {/* Metadata Chips Row (Mood, Sharing & References) */}
        {(block.moodScore !== null ||
          block.sharedLabel ||
          block.referencedCommitHash ||
          block.referencedAppointment) && (
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
            {block.referencedCommitHash && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  selectCommitAndNotify(block.referencedCommitHash!);
                }}
                className="jgit-card-bottom-chip border-0"
                style={{
                  backgroundColor: "#ede9fe",
                  color: "#5b21b6",
                  border: "1px solid #c4b5fd",
                  cursor: "pointer",
                }}
                title={loc(
                  "Hop til tilknyttet revision",
                  "Jump to linked revision"
                )}
              >
                <i className="bi bi-link-45deg"></i>
                <span className="fw-semibold">{loc("Tilknyttet revision", "Linked revision")}</span>
                <i className="bi bi-box-arrow-up-right" style={{ fontSize: "0.62rem" }}></i>
              </button>
            )}
            {block.referencedAppointment && (() => {
              const cleanApt = cleanAppointmentReference(block.referencedAppointment);
              const label = cleanApt.toLowerCase().startsWith("aftale")
                ? cleanApt
                : `${loc("Aftale", "Apt")}: ${cleanApt}`;
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAppointment?.(block.referencedAppointment!);
                  }}
                  className="jgit-card-bottom-chip border-0"
                  style={{
                    backgroundColor: "#e0f2fe",
                    color: "#0369a1",
                    border: "1px solid #bae6fd",
                    cursor: onOpenAppointment ? "pointer" : "default",
                  }}
                  title={loc(
                    `Åbn tilknyttet aftale: ${cleanApt}`,
                    `Open linked appointment: ${cleanApt}`
                  )}
                >
                  <i className="bi bi-calendar-event"></i>
                  <span className="fw-semibold">{label}</span>
                  {onOpenAppointment && (
                    <i className="bi bi-box-arrow-up-right" style={{ fontSize: "0.62rem" }}></i>
                  )}
                </button>
              );
            })()}
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
              "Klik på en revision på 2D-tidslinjen ovenfor for at se ændringen.",
              "Click a revision on the 2D timeline above to inspect the change."
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
                        `Tilføjet i denne revision - Version ${activeCommitIndex + 1} af ${visibleWindowCommits.length}`,
                        `Added in this revision - Version ${activeCommitIndex + 1} of ${visibleWindowCommits.length}`
                      )
                    : viewMode === "COMPARE"
                    ? loc(
                        `Sammenlign versioner - Version ${activeCommitIndex + 1} af ${visibleWindowCommits.length}`,
                        `Compare versions - Version ${activeCommitIndex + 1} of ${visibleWindowCommits.length}`
                      )
                    : loc(
                        `Fuld journaltilstand - Version ${activeCommitIndex + 1} af ${visibleWindowCommits.length}`,
                        `Full journal state - Version ${activeCommitIndex + 1} of ${visibleWindowCommits.length}`
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
                      ") for at sammenligne 2 versioner.",
                      ") to compare 2 versions."
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
                    {loc("Ændring i denne revision", "Change in this revision")}
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
                    {loc("Sammenlign versioner", "Compare versions")}
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
                    {loc("Fuld journaltilstand", "Full journal state")}
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
              </div>
            </div>

            {/* MODE 1 (DEFAULT): ONLY what was added in the selected commit */}
            {viewMode === "DELTA" && (
              <div className="jgit-version-box p-3.5">
                <div className="jgit-version-box-title d-flex flex-wrap justify-content-between align-items-center gap-2 pb-2 mb-3 border-bottom">
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <span className="fw-bold text-dark">
                      {loc("Tilføjet i denne revision", "Added in this revision")}
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
                      ({commit.formattedDate} kl. {commit.formattedTime})
                    </span>
                    {commit.referencedCommitHash && (
                      <button
                        type="button"
                        onClick={() => selectCommitAndNotify(commit.referencedCommitHash!)}
                        className="badge rounded-pill border d-inline-flex align-items-center gap-1 text-decoration-none shadow-xs"
                        style={{
                          backgroundColor: "#ede9fe",
                          borderColor: "#c4b5fd",
                          color: "#5b21b6",
                          fontSize: "0.74rem",
                          cursor: "pointer",
                        }}
                        title={loc(
                          "Hop til tilknyttet revision",
                          "Jump to linked revision"
                        )}
                      >
                        <i className="bi bi-link-45deg"></i>
                        <span>{loc("Tilknyttet revision", "Linked revision")}</span>
                        <i className="bi bi-box-arrow-up-right" style={{ fontSize: "0.62rem" }}></i>
                      </button>
                    )}
                    {commit.referencedAppointment && (
                      <button
                        type="button"
                        onClick={() => onOpenAppointment?.(commit.referencedAppointment!)}
                        className="badge rounded-pill border d-inline-flex align-items-center gap-1 text-decoration-none shadow-xs"
                        style={{
                          backgroundColor: "#e0f2fe",
                          borderColor: "#bae6fd",
                          color: "#0369a1",
                          fontSize: "0.74rem",
                          cursor: onOpenAppointment ? "pointer" : "default",
                        }}
                        title={loc(
                          `Åbn tilknyttet aftale: ${cleanAppointmentReference(commit.referencedAppointment)}`,
                          `Open linked appointment: ${cleanAppointmentReference(commit.referencedAppointment)}`
                        )}
                      >
                        <i className="bi bi-calendar-event"></i>
                        <span>{cleanAppointmentReference(commit.referencedAppointment)}</span>
                        {onOpenAppointment && (
                          <i className="bi bi-box-arrow-up-right" style={{ fontSize: "0.62rem" }}></i>
                        )}
                      </button>
                    )}
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
                      ? loc("nyt indlæg i denne revision", "new entry in this revision")
                      : loc("nye indlæg i denne revision", "new entries in this revision")}
                  </span>
                </div>

                <div className="jgit-version-content d-flex flex-column gap-2.5">
                  {singleCommitAddedBlocks.length === 0 ? (
                    <div className="p-3 rounded-3 bg-light border text-muted small">
                      {loc(
                        "Ingen nye indlæg tilføjet i denne revision.",
                        "No new entries added in this revision."
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
                              vs. {c.authorDisplayName} ({c.formattedDate} kl. {c.formattedTime})
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
                        `Nu (${commit.authorDisplayName} • ${commit.formattedDate} kl. ${commit.formattedTime})`,
                        `Now (${commit.authorDisplayName} • ${commit.formattedDate} at ${commit.formattedTime})`
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
                              ({previousOrComparedCommit.authorDisplayName} •{" "}
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
                              "Ingen tidligere version (Første indlæg i journalen).",
                              "No previous version (First entry in journal)."
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
                            ({commit.authorDisplayName} •{" "}
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
                      `Fuld journaltilstand (${commit.authorDisplayName} • ${commit.formattedDate} kl. ${commit.formattedTime})`,
                      `Full journal state (${commit.authorDisplayName} • ${commit.formattedDate} at ${commit.formattedTime})`
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

      {/* TOP CONTROL BAR: Clean unified toolbar with Filtre & Swimlanes button, active chips, search and zoom */}
      <div className="jgit-zoom-control-bar d-flex flex-wrap justify-content-between align-items-center gap-2.5 px-3 py-2 rounded-4 mb-2">
        {/* Left: Filtre & Swimlanes Button + Quick Privacy Toggle + Active Filter Chips */}
        <div className="d-flex flex-wrap align-items-center gap-2">
          {/* Main Pop-up Trigger Button */}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="btn btn-sm btn-outline-primary rounded-pill px-3 py-1 fw-semibold d-inline-flex align-items-center gap-1.5 shadow-xs"
            style={{ fontSize: "0.76rem", height: "28px" }}
            title={loc(
              "Vælg antal og specifikke swimlanes, datointervaller, humørscore og kategorier",
              "Choose number and specific swimlanes, date ranges, mood score, and categories"
            )}
          >
            <i className="bi bi-sliders"></i>
            <span>{loc("Filtre & Swimlanes", "Filters & Swimlanes")}</span>
            {activeFiltersCount > 0 && (
              <span className="badge bg-primary text-white rounded-pill px-2 py-0.5 ms-0.5">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* Quick Screen Share Privacy Toggle (Therapist View) */}
          {isTherapistView && (
            <button
              type="button"
              onClick={toggleHideConfidential}
              className={`btn btn-sm rounded-pill px-2.5 py-0.5 fw-semibold border d-inline-flex align-items-center justify-content-center ${
                hideConfidential
                  ? "bg-warning text-dark border-warning"
                  : "bg-white bg-opacity-75 text-secondary"
              }`}
              style={{ fontSize: "0.74rem", height: "28px" }}
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
          )}

          {/* Active Filter Chips with quick remove */}
          {activeFilter !== "ALL" && (
            <span
              className="badge rounded-pill bg-white border text-dark fw-medium d-inline-flex align-items-center gap-1 px-2.5 py-1 shadow-xs"
              style={{ fontSize: "0.72rem", height: "28px" }}
            >
              <span>
                {loc("Kategori:", "Category:")}{" "}
                <strong>
                  {activeFilter === "CLIENT"
                    ? loc("Klient", "Client")
                    : activeFilter === "THERAPIST"
                    ? loc("Terapeut", "Therapist")
                    : activeFilter === "CONFIDENTIAL"
                    ? loc("Fortrolig", "Confidential")
                    : loc("Aftaler", "Appointments")}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => setActiveFilter("ALL")}
                className="btn-close ms-1"
                style={{ fontSize: "0.55rem" }}
                aria-label="Fjern filter"
              />
            </span>
          )}

          {(startDateFilter || endDateFilter) && (
            <span
              className="badge rounded-pill bg-white border text-dark fw-medium d-inline-flex align-items-center gap-1 px-2.5 py-1 shadow-xs"
              style={{ fontSize: "0.72rem", height: "28px" }}
            >
              <span>
                📅 {startDateFilter || "..."} → {endDateFilter || loc("i dag", "today")}
              </span>
              <button
                type="button"
                onClick={() => {
                  setStartDateFilter("");
                  setEndDateFilter("");
                }}
                className="btn-close ms-1"
                style={{ fontSize: "0.55rem" }}
                aria-label="Fjern datofilter"
              />
            </span>
          )}

          {moodFilter !== "ALL" && (
            <span
              className="badge rounded-pill bg-white border text-dark fw-medium d-inline-flex align-items-center gap-1 px-2.5 py-1 shadow-xs"
              style={{ fontSize: "0.72rem", height: "28px" }}
            >
              <span>
                {moodFilter === "HIGH"
                  ? "🟢 Humør 8-10"
                  : moodFilter === "MEDIUM"
                  ? "🟡 Humør 4-7"
                  : "🔴 Humør 1-3"}
              </span>
              <button
                type="button"
                onClick={() => setMoodFilter("ALL")}
                className="btn-close ms-1"
                style={{ fontSize: "0.55rem" }}
                aria-label="Fjern humørfilter"
              />
            </span>
          )}

          {disabledLaneKeys.length > 0 && (
            <span
              className="badge rounded-pill bg-white border text-dark fw-medium d-inline-flex align-items-center gap-1 px-2.5 py-1 shadow-xs"
              style={{ fontSize: "0.72rem", height: "28px" }}
            >
              <span>
                {disabledLaneKeys.length} {loc("spor skjult", "lanes hidden")}
              </span>
              <button
                type="button"
                onClick={() => setDisabledLaneKeys([])}
                className="btn-close ms-1"
                style={{ fontSize: "0.55rem" }}
                aria-label="Vis alle spor"
              />
            </span>
          )}

          {typeof maxLanes === "number" && (
            <span
              className="badge rounded-pill bg-white border text-dark fw-medium d-inline-flex align-items-center gap-1 px-2.5 py-1 shadow-xs"
              style={{ fontSize: "0.72rem", height: "28px" }}
            >
              <span>
                {loc("Maks", "Max")} {maxLanes} {loc("spor", "lanes")}
              </span>
              <button
                type="button"
                onClick={() => setMaxLanes(null)}
                className="btn-close ms-1"
                style={{ fontSize: "0.55rem" }}
                aria-label="Fjern maks grænse"
              />
            </span>
          )}

          {hideEmptyLanes && (
            <span
              className="badge rounded-pill bg-white border text-dark fw-medium d-inline-flex align-items-center gap-1 px-2.5 py-1 shadow-xs"
              style={{ fontSize: "0.72rem", height: "28px" }}
            >
              <span>{loc("Skjuler tomme spor", "Hiding empty lanes")}</span>
              <button
                type="button"
                onClick={() => setHideEmptyLanes(false)}
                className="btn-close ms-1"
                style={{ fontSize: "0.55rem" }}
                aria-label="Vis også tomme spor"
              />
            </span>
          )}

          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="btn btn-sm btn-link p-0 text-muted small text-decoration-none"
              style={{ fontSize: "0.72rem" }}
            >
              {loc("Nulstil alle", "Reset all")}
            </button>
          )}

          {/* Lane count and commit count indicator */}
          <span
            className="text-muted d-none d-lg-inline ps-1 text-nowrap"
            style={{ fontSize: "0.74rem" }}
          >
            {swimlanes.length} {loc("aktive spor", "active lanes")} •{" "}
            {visibleWindowCommits.length} {loc("hændelser", "entries")}
          </span>

          {toolbarActions && <div>{toolbarActions}</div>}
        </div>

        {/* Right: Search Bar & Extended Zoom Bar */}
        <div className="d-flex flex-wrap align-items-center gap-2.5 ms-auto">
          {/* Search Input */}
          <div className="position-relative d-flex align-items-center">
            <input
              type="text"
              className="form-control form-control-sm rounded-pill bg-white border ps-3 pe-4"
              style={{ width: "175px", fontSize: "0.74rem", height: "28px" }}
              placeholder={loc("Søg i hændelser...", "Search entries...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="btn btn-link p-0 position-absolute end-0 me-2 text-muted"
                style={{ fontSize: "0.68rem", lineHeight: 1 }}
              >
                ✕
              </button>
            ) : (
              <i
                className="bi bi-search position-absolute end-0 me-2.5 text-muted pointer-events-none"
                style={{ fontSize: "0.68rem" }}
              />
            )}
          </div>

          {/* Zoom Bar */}
          <div className="d-flex align-items-center gap-1.5">
            <span
              className="small fw-semibold text-dark text-nowrap d-none d-sm-inline"
              style={{ fontSize: "0.74rem" }}
            >
              Zoom ({zoomScale}%):
            </span>
            <button
              type="button"
              onClick={() => adjustZoom(-20)}
              className="btn btn-sm btn-light border rounded-circle d-inline-flex align-items-center justify-content-center p-0"
              style={{ width: "24px", height: "24px", fontSize: "0.74rem" }}
              title={loc("Zoom ud", "Zoom out")}
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
              className="jgit-clean-zoom-slider"
              style={{ width: "90px" }}
              aria-label="Zoom tidslinje"
            />
            <button
              type="button"
              onClick={() => adjustZoom(20)}
              className="btn btn-sm btn-light border rounded-circle d-inline-flex align-items-center justify-content-center p-0"
              style={{ width: "24px", height: "24px", fontSize: "0.74rem" }}
              title={loc("Zoom ind", "Zoom in")}
            >
              <i className="bi bi-plus-lg"></i>
            </button>
            {zoomScale !== 100 && (
              <button
                type="button"
                onClick={resetZoomAndRange}
                className="btn btn-sm btn-light border rounded-pill px-1.5 py-0.5 text-secondary fw-semibold text-nowrap"
                style={{ fontSize: "0.68rem" }}
                title={loc("Nulstil zoom (100%)", "Reset zoom (100%)")}
              >
                100%
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Under Toolbar Content (e.g. Collapsible Note Composer) */}
      {underToolbar}

      {/* 2D SWIMLANE TIMELINE (Y-axis = Named Client & Therapist Lanes, X-axis = Time) */}
      {visibleWindowCommits.length === 0 ? (
        <div className="p-4 rounded-4 border bg-white bg-opacity-75 text-center text-muted small mb-2">
          {loc("Ingen hændelser fundet.", "No entries found.")}
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
                    {visibleWindowCommits.length} {loc("opdateringer", "entries")}
                  </div>
                </div>

                <div className="jgit-2d-columns-track">
                  {visibleWindowCommits.map((c) => {
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
                          {c.shortDate}
                        </span>
                        <span className="text-muted ms-1" style={{ fontSize: "0.67rem" }}>
                          {loc("kl.", "at")} {c.formattedTime}
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
                            {loc(
                              lane.commitCount === 1 ? "opdatering" : "opdateringer",
                              lane.commitCount === 1 ? "entry" : "entries"
                            )}
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
                            data-commit-fullhash={belongsToLane ? (c.fullHash || c.commitHash) : undefined}
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
                                            `Sammenlign med revision (${c.formattedDate} kl. ${c.formattedTime})`,
                                            `Compare with revision (${c.formattedDate} at ${c.formattedTime})`
                                          )}
                                        >
                                          <i className="bi bi-arrow-left-right"></i>
                                        </button>
                                      )}
                                  </div>

                                  {/* Row 2: Date & Time */}
                                  {zoomDetailLevel !== "COMPACT" && (
                                    <div className="d-flex align-items-center gap-1 mb-1 text-muted" style={{ fontSize: "0.66rem" }}>
                                      <i className="bi bi-clock opacity-75"></i>
                                      <span className="fw-medium">
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
                                    title={`${c.message} (${c.formattedDate} kl. ${c.formattedTime})`}
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
                                    {c.category === "APPOINTMENT" ? (
                                      <span
                                        className="jgit-card-bottom-chip"
                                        style={{
                                          backgroundColor: "#e0f2fe",
                                          color: "#0369a1",
                                        }}
                                      >
                                        <span>📅</span>
                                        <span>
                                          {c.message.toLowerCase().includes("aflyst")
                                            ? loc("Aflyst", "Cancelled")
                                            : c.message.toLowerCase().includes("ombooket")
                                            ? loc("Ombooket", "Rescheduled")
                                            : loc("Bekræftet", "Confirmed")}
                                        </span>
                                      </span>
                                    ) : c.category === "CONFIDENTIAL" ? (
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

                                    {c.referencedCommitHash && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          selectCommitAndNotify(c.referencedCommitHash!);
                                        }}
                                        className="badge rounded-pill border-0 d-inline-flex align-items-center gap-1 text-decoration-none"
                                        style={{
                                          backgroundColor: "#ede9fe",
                                          color: "#5b21b6",
                                          fontSize: "0.62rem",
                                          cursor: "pointer",
                                        }}
                                        title={loc(
                                          "Tilknyttet revision",
                                          "Linked revision"
                                        )}
                                      >
                                        <i className="bi bi-link-45deg"></i>
                                        <span>{loc("Tilknyttet revision", "Linked rev")}</span>
                                      </button>
                                    )}

                                    {c.referencedAppointment && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onOpenAppointment?.(c.referencedAppointment!);
                                        }}
                                        className="badge rounded-pill border-0 d-inline-flex align-items-center gap-1 text-decoration-none"
                                        style={{
                                          backgroundColor: "#e0f2fe",
                                          color: "#0369a1",
                                          fontSize: "0.62rem",
                                          cursor: onOpenAppointment ? "pointer" : "default",
                                          maxWidth: "135px",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                        }}
                                        title={loc(
                                          `Tilknyttet aftale: ${cleanAppointmentReference(c.referencedAppointment)}`,
                                          `Linked appointment: ${cleanAppointmentReference(c.referencedAppointment)}`
                                        )}
                                      >
                                        <i className="bi bi-calendar-event"></i>
                                        <span>{cleanAppointmentReference(c.referencedAppointment)}</span>
                                      </button>
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
                                        {loc("Før", "Before")} ({c.shortDate})
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

      {/* ADVANCED FILTERS & SWIMLANES POP-UP MODAL (Base UI Dialog) */}
      <Dialog.Root open={isModalOpen} onOpenChange={setModalOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="base-dialog-backdrop" />
          <Dialog.Popup
            className="base-dialog-popup p-0 overflow-hidden shadow-lg border rounded-4 bg-white"
            style={{ maxWidth: "660px", width: "95vw" }}
          >
            {/* Modal Header */}
            <div className="d-flex justify-content-between align-items-center px-4 py-3 border-bottom bg-light bg-opacity-50">
              <div className="d-flex align-items-center gap-2.5">
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center bg-primary-subtle text-primary"
                  style={{ width: "36px", height: "36px" }}
                >
                  <i className="bi bi-sliders fs-5"></i>
                </div>
                <div>
                  <Dialog.Title className="h6 fw-bold mb-0 text-dark">
                    {loc("Filtre & Swimlanes Styring", "Filters & Swimlanes Management")}
                  </Dialog.Title>
                  <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                    {loc(
                      "Tilpas antal og valg af spor, samt filtrér journalhistorikken",
                      "Customize number and choice of lanes, and filter journal history"
                    )}
                  </div>
                </div>
              </div>
              <Dialog.Close
                className="btn-close"
                aria-label={loc("Luk", "Close")}
              />
            </div>

            {/* Modal Navigation Tabs */}
            <div className="d-flex border-bottom px-4 pt-2 bg-white gap-2">
              <button
                type="button"
                onClick={() => setModalActiveTab("SWIMLANES")}
                className={`btn btn-sm rounded-top-3 px-3 py-2 fw-semibold d-inline-flex align-items-center gap-1.5 border-bottom border-2 ${
                  modalActiveTab === "SWIMLANES"
                    ? "border-primary text-primary bg-primary-subtle bg-opacity-25"
                    : "border-transparent text-secondary hover-bg-light"
                }`}
                style={{ fontSize: "0.82rem" }}
              >
                <span>🌊 {loc("Swimlanes & Spor", "Swimlanes & Lanes")}</span>
                <span className="badge rounded-pill bg-secondary bg-opacity-25 text-dark ms-1">
                  {swimlanes.length}/{allAvailableLanes.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setModalActiveTab("FILTERS")}
                className={`btn btn-sm rounded-top-3 px-3 py-2 fw-semibold d-inline-flex align-items-center gap-1.5 border-bottom border-2 ${
                  modalActiveTab === "FILTERS"
                    ? "border-primary text-primary bg-primary-subtle bg-opacity-25"
                    : "border-transparent text-secondary hover-bg-light"
                }`}
                style={{ fontSize: "0.82rem" }}
              >
                <span>🔍 {loc("Avancerede Filtre", "Advanced Filters")}</span>
                {(activeFilter !== "ALL" ||
                  hideConfidential ||
                  moodFilter !== "ALL" ||
                  startDateFilter ||
                  endDateFilter) && (
                  <span className="badge rounded-pill bg-primary text-white ms-1">
                    Aktiv
                  </span>
                )}
              </button>
            </div>

            {/* Modal Body with Scroll */}
            <div
              className="p-4 overflow-y-auto"
              style={{ maxHeight: "65vh", fontSize: "0.84rem" }}
            >
              {modalActiveTab === "SWIMLANES" ? (
                <div className="d-flex flex-column gap-4">
                  {/* Presets */}
                  <div>
                    <label className="form-label fw-bold text-dark d-flex align-items-center gap-1.5 mb-2">
                      <i className="bi bi-lightning-charge text-warning"></i>
                      {loc("Hurtig-valg af spor", "Quick Lane Presets")}
                    </label>
                    <div className="d-flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => applySwimlanePreset("ALL")}
                        className={`btn btn-sm rounded-pill px-3 py-1 ${
                          disabledLaneKeys.length === 0 && maxLanes === null
                            ? "btn-dark fw-semibold"
                            : "btn-outline-secondary"
                        }`}
                      >
                        {loc("Vis alle spor", "Show all lanes")} ({allAvailableLanes.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => applySwimlanePreset("CLIENT_ONLY")}
                        className={`btn btn-sm rounded-pill px-3 py-1 ${
                          allAvailableLanes.filter((l) => l.category === "CLIENT").every((l) => !disabledLaneKeys.includes(l.laneKey)) &&
                          allAvailableLanes.filter((l) => l.category !== "CLIENT").every((l) => disabledLaneKeys.includes(l.laneKey))
                            ? "btn-success fw-semibold text-white"
                            : "btn-outline-success"
                        }`}
                      >
                        {loc("Kun klient-spor", "Client lane only")}
                      </button>
                      <button
                        type="button"
                        onClick={() => applySwimlanePreset("THERAPISTS_ONLY")}
                        className={`btn btn-sm rounded-pill px-3 py-1 ${
                          allAvailableLanes.filter((l) => l.category !== "CLIENT").every((l) => !disabledLaneKeys.includes(l.laneKey)) &&
                          allAvailableLanes.filter((l) => l.category === "CLIENT").every((l) => disabledLaneKeys.includes(l.laneKey))
                            ? "btn-primary fw-semibold text-white"
                            : "btn-outline-primary"
                        }`}
                      >
                        {loc("Kun behandlere", "Therapists only")}
                      </button>
                    </div>
                  </div>

                  {/* Max number of swimlanes */}
                  <div className="border-top pt-3">
                    <label className="form-label fw-bold text-dark d-flex align-items-center gap-1.5 mb-1">
                      <i className="bi bi-stack text-primary"></i>
                      {loc("Hvor mange swimlanes vil du se samtidig?", "How many swimlanes to display simultaneously?")}
                    </label>
                    <div className="text-muted small mb-2">
                      {loc(
                        "Begræns antallet af synlige spor for at bevare fokus eller undgå lodret rulning.",
                        "Limit number of visible lanes to maintain focus or avoid vertical scrolling."
                      )}
                    </div>
                    <div className="d-flex flex-wrap gap-2">
                      {[
                        { label: loc("Alle (ubegrænset)", "All (unlimited)"), val: null },
                        { label: loc("1 spor", "1 lane"), val: 1 },
                        { label: loc("2 spor", "2 lanes"), val: 2 },
                        { label: loc("3 spor", "3 lanes"), val: 3 },
                        { label: loc("4 spor", "4 lanes"), val: 4 },
                      ].map((opt) => (
                        <button
                          key={String(opt.val)}
                          type="button"
                          onClick={() => setMaxLanes(opt.val)}
                          className={`btn btn-sm rounded-pill px-3 py-1 fw-medium ${
                            maxLanes === opt.val
                              ? "btn-primary text-white fw-bold shadow-xs"
                              : "btn-outline-secondary"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Hide empty swimlanes toggle */}
                  <div className="border-top pt-3">
                    <div className="form-check form-switch d-flex align-items-center justify-content-between p-0 m-0">
                      <div>
                        <label
                          htmlFor="hide-empty-lanes-toggle"
                          className="form-check-label fw-bold text-dark cursor-pointer mb-0"
                        >
                          {loc("Skjul tomme swimlanes", "Hide empty swimlanes")}
                        </label>
                        <div className="text-muted small">
                          {loc(
                            "Skjul automatisk spor, der ikke har nogen hændelser i den valgte tidsperiode",
                            "Automatically hide lanes that have no entries in the selected time range"
                          )}
                        </div>
                      </div>
                      <input
                        id="hide-empty-lanes-toggle"
                        type="checkbox"
                        className="form-check-input cursor-pointer ms-3"
                        style={{ width: "2.5em", height: "1.3em" }}
                        checked={hideEmptyLanes}
                        onChange={(e) => setHideEmptyLanes(e.target.checked)}
                      />
                    </div>
                  </div>

                  {/* Individual Swimlane Checklist */}
                  <div className="border-top pt-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <label className="form-label fw-bold text-dark d-flex align-items-center gap-1.5 mb-0">
                        <i className="bi bi-check2-square text-success"></i>
                        {loc("Vælg hvilke spor der skal vises", "Choose which lanes to display")} ({allAvailableLanes.length})
                      </label>
                      <div className="d-flex gap-2">
                        <button
                          type="button"
                          onClick={() => setDisabledLaneKeys([])}
                          className="btn btn-link btn-sm p-0 text-decoration-none small"
                        >
                          {loc("Aktivér alle", "Enable all")}
                        </button>
                        <span className="text-muted">•</span>
                        <button
                          type="button"
                          onClick={() => setDisabledLaneKeys(allAvailableLanes.map((l) => l.laneKey))}
                          className="btn btn-link btn-sm p-0 text-decoration-none small text-danger"
                        >
                          {loc("Deaktiver alle", "Disable all")}
                        </button>
                      </div>
                    </div>

                    <div className="d-flex flex-column gap-2 mt-2">
                      {allAvailableLanes.map((lane) => {
                        const isEnabled = !disabledLaneKeys.includes(lane.laneKey);
                        const meta = getCategoryMeta(lane.category);
                        return (
                          <div
                            key={lane.laneKey}
                            onClick={() => toggleLaneKey(lane.laneKey)}
                            className={`p-2.5 rounded-3 border d-flex align-items-center justify-content-between cursor-pointer transition-all ${
                              isEnabled
                                ? "bg-white border-primary-subtle shadow-xs"
                                : "bg-light bg-opacity-50 text-muted opacity-75"
                            }`}
                            style={{
                              borderLeft: isEnabled ? `4px solid ${meta.dotColor}` : undefined,
                            }}
                          >
                            <div className="d-flex align-items-center gap-2.5">
                              <input
                                type="checkbox"
                                className="form-check-input mt-0 cursor-pointer"
                                checked={isEnabled}
                                onChange={() => toggleLaneKey(lane.laneKey)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <span
                                className="jgit-card-avatar"
                                style={{
                                  backgroundColor: meta.avatarBg,
                                  width: "28px",
                                  height: "28px",
                                  fontSize: "0.72rem",
                                }}
                              >
                                {lane.authorInitials}
                              </span>
                              <div>
                                <div className="d-flex align-items-center gap-1.5">
                                  <span className="fw-bold text-dark" style={{ fontSize: "0.82rem" }}>
                                    {lane.authorDisplayName}
                                  </span>
                                  <span
                                    className="badge rounded-pill"
                                    style={{
                                      backgroundColor: meta.pillBg,
                                      color: meta.pillText,
                                      fontSize: "0.62rem",
                                    }}
                                  >
                                    {lane.roleLabel}
                                  </span>
                                </div>
                                <span className="text-muted" style={{ fontSize: "0.72rem" }}>
                                  {lane.commitCount}{" "}
                                  {loc(
                                    lane.commitCount === 1 ? "hændelse i forløbet" : "hændelser i forløbet",
                                    lane.commitCount === 1 ? "entry total" : "entries total"
                                  )}
                                </span>
                              </div>
                            </div>

                            <span
                              className={`badge rounded-pill px-2 py-0.5 ${
                                isEnabled ? "bg-success-subtle text-success" : "bg-secondary-subtle text-secondary"
                              }`}
                              style={{ fontSize: "0.68rem" }}
                            >
                              {isEnabled ? loc("Synlig", "Visible") : loc("Skjult", "Hidden")}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="d-flex flex-column gap-4">
                  {/* Category Filter */}
                  <div>
                    <label className="form-label fw-bold text-dark d-flex align-items-center gap-1.5 mb-2">
                      <i className="bi bi-tags text-primary"></i>
                      {loc("Hændelseskategori", "Entry Category")}
                    </label>
                    <div className="d-flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveFilter("ALL")}
                        className={`btn btn-sm rounded-pill px-3 py-1 ${
                          activeFilter === "ALL" ? "btn-dark fw-semibold" : "btn-outline-secondary"
                        }`}
                      >
                        {loc("Alle kategorier", "All categories")} ({enrichedCommits.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveFilter("CLIENT")}
                        className={`btn btn-sm rounded-pill px-3 py-1 ${
                          activeFilter === "CLIENT"
                            ? "btn-success fw-semibold text-white"
                            : "btn-outline-success"
                        }`}
                      >
                        {loc("Klient-indlæg", "Client entries")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveFilter("THERAPIST")}
                        className={`btn btn-sm rounded-pill px-3 py-1 ${
                          activeFilter === "THERAPIST"
                            ? "btn-primary fw-semibold text-white"
                            : "btn-outline-primary"
                        }`}
                      >
                        {loc("Terapeutisk opfølgning", "Therapist follow-up")}
                      </button>
                      {isTherapistView && (
                        <button
                          type="button"
                          onClick={() => {
                            setHideConfidential(false);
                            setActiveFilter("CONFIDENTIAL");
                          }}
                          className={`btn btn-sm rounded-pill px-3 py-1 ${
                            activeFilter === "CONFIDENTIAL"
                              ? "btn-warning fw-semibold text-dark"
                              : "btn-outline-warning text-dark"
                          }`}
                        >
                          🔒 {loc("Fortroligt klinisk notat", "Confidential clinical note")}
                        </button>
                      )}
                      {!isTherapistView && (
                        <button
                          type="button"
                          onClick={() => setActiveFilter("APPOINTMENT")}
                          className={`btn btn-sm rounded-pill px-3 py-1 ${
                            activeFilter === "APPOINTMENT"
                              ? "btn-info fw-semibold text-white"
                              : "btn-outline-info"
                          }`}
                        >
                          📅 {loc("Aftaler", "Appointments")}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Screen Share & Confidential Privacy Toggle */}
                  {isTherapistView && (
                    <div className="border-top pt-3">
                      <div className="p-3 rounded-3 border bg-warning-subtle bg-opacity-25 d-flex align-items-center justify-content-between gap-3">
                        <div>
                          <div className="fw-bold text-dark d-flex align-items-center gap-1.5">
                            <i className="bi bi-shield-lock-fill text-warning"></i>
                            {loc("Skærmdeling & Fortrolighedssikring", "Screen Share & Confidentiality Protection")}
                          </div>
                          <div className="text-muted small mt-0.5">
                            {loc(
                              "Skjuler alle interne, fortrolige behandlernoter på tidslinjen. Ideelt ved direkte gennemgang med klienten.",
                              "Hides all internal, confidential clinical notes from the timeline. Ideal during direct review with the client."
                            )}
                          </div>
                        </div>
                        <div className="form-check form-switch m-0">
                          <input
                            type="checkbox"
                            className="form-check-input cursor-pointer"
                            style={{ width: "2.5em", height: "1.3em" }}
                            checked={hideConfidential}
                            onChange={(e) => setHideConfidential(e.target.checked)}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Date Range & Quick Presets */}
                  <div className="border-top pt-3">
                    <label className="form-label fw-bold text-dark d-flex align-items-center gap-1.5 mb-1">
                      <i className="bi bi-calendar3 text-primary"></i>
                      {loc("Tidsinterval & Hurtig-valg", "Date Range & Quick Presets")}
                    </label>
                    <div className="d-flex flex-wrap gap-1.5 mb-2.5">
                      <button
                        type="button"
                        onClick={() => setQuickDateRange(7)}
                        className="btn btn-sm btn-outline-secondary rounded-pill px-2.5 py-0.5"
                        style={{ fontSize: "0.75rem" }}
                      >
                        {loc("Seneste 7 dage", "Last 7 days")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickDateRange(30)}
                        className="btn btn-sm btn-outline-secondary rounded-pill px-2.5 py-0.5"
                        style={{ fontSize: "0.75rem" }}
                      >
                        {loc("Seneste 30 dage", "Last 30 days")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickDateRange(90)}
                        className="btn btn-sm btn-outline-secondary rounded-pill px-2.5 py-0.5"
                        style={{ fontSize: "0.75rem" }}
                      >
                        {loc("Seneste 90 dage", "Last 90 days")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickDateRange("ALL")}
                        className="btn btn-sm btn-outline-secondary rounded-pill px-2.5 py-0.5"
                        style={{ fontSize: "0.75rem" }}
                      >
                        {loc("Hele forløbet (Alle datoer)", "All dates")}
                      </button>
                    </div>

                    <div className="row g-2 align-items-center">
                      <div className="col-sm-6">
                        <label className="form-label small text-muted mb-1">
                          {loc("Fra dato:", "From date:")}
                        </label>
                        <input
                          type="date"
                          className="form-control form-control-sm"
                          value={startDateFilter}
                          min={minAvailableDate || undefined}
                          max={endDateFilter || maxAvailableDate || undefined}
                          onChange={(e) => setStartDateFilter(e.target.value)}
                        />
                      </div>
                      <div className="col-sm-6">
                        <label className="form-label small text-muted mb-1">
                          {loc("Til dato:", "To date:")}
                        </label>
                        <input
                          type="date"
                          className="form-control form-control-sm"
                          value={endDateFilter}
                          min={startDateFilter || minAvailableDate || undefined}
                          max={maxAvailableDate || undefined}
                          onChange={(e) => setEndDateFilter(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Mood / Emotional Score Filter */}
                  <div className="border-top pt-3">
                    <label className="form-label fw-bold text-dark d-flex align-items-center gap-1.5 mb-1">
                      <i className="bi bi-heart-pulse text-danger"></i>
                      {loc("Klientens humørscore (1-10)", "Client Mood Score (1-10)")}
                    </label>
                    <div className="text-muted small mb-2">
                      {loc(
                        "Filtrér efter klientens registrerede humør og stemningsleje.",
                        "Filter by client's recorded mood and emotional score."
                      )}
                    </div>
                    <div className="d-flex flex-wrap gap-2">
                      {[
                        { key: "ALL", label: loc("Alle stemningslejer", "All mood scores") },
                        { key: "HIGH", label: `🟢 ${loc("Højt humør (8-10)", "High mood (8-10)")}` },
                        { key: "MEDIUM", label: `🟡 ${loc("Middel/Neutralt (4-7)", "Medium (4-7)")}` },
                        { key: "LOW", label: `🔴 ${loc("Lavt humør (1-3)", "Low mood (1-3)")}` },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setMoodFilter(item.key as any)}
                          className={`btn btn-sm rounded-pill px-3 py-1 ${
                            moodFilter === item.key
                              ? "btn-dark fw-bold text-white shadow-xs"
                              : "btn-outline-secondary"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="d-flex justify-content-between align-items-center px-4 py-3 border-top bg-light bg-opacity-50">
              <div className="text-muted small d-flex align-items-center gap-1.5">
                <i className="bi bi-info-circle text-primary"></i>
                <span>
                  {loc("Viser", "Showing")}{" "}
                  <strong className="text-dark">{visibleWindowCommits.length}</strong> af{" "}
                  {enrichedCommits.length} {loc("hændelser", "entries")}{" "}
                  {loc("fordelt på", "across")}{" "}
                  <strong className="text-dark">{swimlanes.length}</strong>{" "}
                  {loc("aktive spor", "active lanes")}
                </span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="btn btn-sm btn-outline-secondary rounded-pill px-3 py-1"
                >
                  {loc("Nulstil filtre", "Reset filters")}
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn btn-sm btn-primary rounded-pill px-4 py-1 fw-bold shadow-xs"
                >
                  {loc("Anvend & Luk", "Apply & Close")}
                </button>
              </div>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* BOTTOM FULL-WIDTH STUDIO: 100% width for commit text & comparison (Revisionshistorik column removed) */}
      {renderBottomFullWidthInspector()}
    </div>
  );
}
