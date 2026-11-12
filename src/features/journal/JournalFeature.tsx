"use client";

/**
 * ============================================================================
 * ARKITEKTONISK VISITKORT: JournalFeature.tsx (Vertical Feature Slice — JGit)
 * ============================================================================
 * @Spejler: backend/src/main/java/com/platform/features/journal/JournalFeature.java
 *
 * FORMÅL (Til Censor, Vejleder & Nykommende Udviklere):
 * 1:1 frontend-spejl af backendens [Class: JournalFeature] og [Service: JournalGitService].
 * Håndterer kliniske og personlige journalindlæg, privatlivsfiltrering af
 * fortrolige behandlernoter (`INTERNAL_MEDICAL_NOTES`) samt fortolkning af
 * Eclipse JGit SHA-1 commit-historik (diff-delta, kategorisering og metadata).
 *
 * ARKITEKTONISK OVERBLIK (5 TRIN):
 *   1. [Record/DTO: JournalEntryDto], [Record/DTO: TherapistClinicalNoteDto],
 *      [Record/DTO: TherapistNoteDto] & [Record/DTO: GitCommitDto]
 *      TypeScript-kontrakter der matcher Java `record` typerne i `JournalFeature.java`.
 *   2. Defense-in-Depth Privatlivsfilter (#filterInternalNotes(rawContent, isTherapist))
 *      Fjerner `<!-- INTERNAL_MEDICAL_NOTES -->`-blokke for ikke-terapeuter i 1:1
 *      symmetri med `JournalFeature#filterInternalNotes` i Java.
 *   3. [Service: JournalApiService] (Modul-Privat — Information Hiding)
 *      Arver fra [AbstractClass: BaseApiService<JournalEntryDto, string>] og
 *      validerer titel, indhold og `moodRating` (1..10) via [Class: DomainGuard].
 *   4. [Hook: useBaseCrud<JournalEntryDto, string>(journalApi)]
 *      Binder `journalApi` til reaktiv React-tilstand.
 *   5. [Component: <JournalFeatureView />]
 *      Beskyttet med [Component: <RoleGuard allowed={["PROVIDER"]} />], så kun
 *      behandlere/terapeuter har adgang til det kliniske journalmodul.
 * ============================================================================
 */

import React, { useState } from "react";
import {
  BaseApiService,
  DomainGuard,
  ErrorCode,
  HasId,
} from "../../core/baseDomainCore";
import { ProblemAlert, RoleGuard, useBaseCrud } from "../../core/baseUiCore";

// ============================================================================
// 1. DTO CONTRACTS & PRIVACY FILTER (1:1 med JournalFeature.java)
// ============================================================================

export interface TherapistNoteDto extends HasId<string> {
  id?: string;
  journalEntryId: string;
  therapistId: string;
  therapistName?: string;
  content: string;
  sharedWithClient: boolean;
  createdAt?: string;
}

export interface TherapistClinicalNoteDto extends HasId<string> {
  id?: string;
  clientId: string;
  therapistId: string;
  title: string;
  content: string;
  gitCommitHash?: string;
  createdAt?: string;
}

export interface GitCommitDto {
  commitHash: string;
  fullHash?: string;
  author: string;
  timestamp: string;
  message: string;
  snapshot: string;
}

export interface JournalEntryDto extends HasId<string> {
  id?: string;
  userId?: string;
  title: string;
  content: string;
  moodRating?: number;
  sharedWithTherapist?: boolean;
  gitCommitHash?: string;
  createdAt?: string;
  updatedAt?: string;
  therapistNotes?: TherapistNoteDto[];
}

/**
 * Ren domænefunktion til privatlivsfiltrering (1:1 med backendens JournalGitService).
 * Fjerner fortrolige kliniske behandlernoter (`INTERNAL_MEDICAL_NOTES`), når
 * indholdet vises for en klient (`isTherapist === false`).
 */
export function filterInternalNotes(
  rawContent: string | null | undefined,
  isTherapist: boolean
): string {
  if (!rawContent) return "";
  if (isTherapist) return rawContent;

  const withoutBlock = rawContent.replace(
    /<!--\s*INTERNAL_MEDICAL_NOTES_START\s*-->[\s\S]*?<!--\s*INTERNAL_MEDICAL_NOTES_END\s*-->/g,
    ""
  );
  const markerIndex = withoutBlock.indexOf("<!-- INTERNAL_MEDICAL_NOTES -->");
  const filtered =
    markerIndex !== -1 ? withoutBlock.slice(0, markerIndex) : withoutBlock;
  return filtered.trim();
}

// ============================================================================
// 2. MODULE-PRIVATE API SERVICE (Ingen 'export' — streng indkapsling)
// ============================================================================

/**
 * Module-private REST-klient bundet til `/api/backend/journals`.
 * Håndhæver klientside-invarianter: titel og indhold må ikke være tomme,
 * og humør-score (`moodRating`) skal ligge i intervallet 1..10.
 */
class JournalApiService extends BaseApiService<JournalEntryDto, string> {
  constructor() {
    super("/api/backend/journals");
  }

  protected override validateBeforeCreate(dto: Partial<JournalEntryDto>): void {
    DomainGuard.requireNotBlank(dto.title, "Journal title", "title");
    DomainGuard.requireNotBlank(dto.content, "Journal content", "content");
    if (dto.moodRating !== undefined) {
      DomainGuard.check(
        dto.moodRating >= 1 && dto.moodRating <= 10,
        "Mood rating must be between 1 and 10",
        ErrorCode.VALIDATION_FAILED,
        "moodRating"
      );
    }
  }
}

const journalApi = new JournalApiService();

// ============================================================================
// 3. EXPORTED FEATURE VIEW (Beskyttet af <RoleGuard allowed={["PROVIDER"]}>)
// ============================================================================

export const JournalFeatureView: React.FC = () => {
  const { items, loading, error, create, remove, clearError } =
    useBaseCrud(journalApi);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [moodRating, setMoodRating] = useState("7");
  const [sharedWithTherapist, setSharedWithTherapist] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await create({
      title,
      content,
      moodRating: Number(moodRating),
      sharedWithTherapist,
    });
    if (created) {
      setTitle("");
      setContent("");
      setMoodRating("7");
    }
  };

  return (
    <RoleGuard
      allowed={["PROVIDER"]}
      fallback={
        <p data-testid="forbidden-notice">
          Kun terapeuter har adgang til klientjournaler.
        </p>
      }
    >
      <div
        className="p-4 max-w-4xl mx-auto"
        data-testid="journal-feature-view"
      >
        <h2 className="text-xl font-bold mb-4">Clinical &amp; Personal Journal</h2>

        <ProblemAlert error={error} onDismiss={clearError} />

        <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Entry Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border p-2 rounded"
            data-testid="input-journal-title"
          />
          <input
            type="text"
            placeholder="Journal Content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="border p-2 rounded"
            data-testid="input-journal-content"
          />
          <input
            type="number"
            placeholder="Mood (1-10)"
            value={moodRating}
            onChange={(e) => setMoodRating(e.target.value)}
            className="border p-2 rounded w-24"
            data-testid="input-journal-mood"
          />
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={sharedWithTherapist}
              onChange={(e) => setSharedWithTherapist(e.target.checked)}
              data-testid="input-journal-shared"
            />
            Share with Therapist
          </label>
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded"
            data-testid="submit-journal"
          >
            Save Entry
          </button>
        </form>

        {loading && <p data-testid="loading-indicator">Loading...</p>}

        <ul className="space-y-2" data-testid="journal-list">
          {items.map((item) => (
            <li
              key={item.id}
              className="border p-3 rounded flex justify-between items-center"
            >
              <div>
                <strong>{item.title}</strong> —{" "}
                <span>{filterInternalNotes(item.content, false)}</span>{" "}
                {item.moodRating !== undefined && (
                  <span className="text-sm text-gray-500">
                    (Mood: {item.moodRating}/10)
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => item.id && remove(item.id)}
                className="text-red-600 hover:underline"
                data-testid={`delete-journal-${item.id}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </RoleGuard>
  );
};

// ============================================================================
// 4. PURE JGIT COMMIT HISTORY & DIFF DOMAIN HELPERS
// ============================================================================

export type JGitCommitCategory =
  | "CLIENT"
  | "THERAPIST"
  | "CONFIDENTIAL"
  | "APPOINTMENT";

/**
 * Beregner diff-deltaet mellem et JGit commit-snapshot og dets forrige commit (`parentSnapshot`).
 */
export function computeCommitDelta(
  currentSnapshot: string,
  parentSnapshot: string
): string {
  const curr = (currentSnapshot || "").trim();
  const prev = (parentSnapshot || "").trim();

  if (!prev) return curr;
  if (curr === prev) return "";
  if (curr.startsWith(prev)) return curr.slice(prev.length).trim();

  const prevLines = new Set(prev.split("\n").map((l) => l.trim()));
  const addedLines = curr
    .split("\n")
    .filter((line) => !prevLines.has(line.trim()));

  return addedLines.join("\n").trim() || curr;
}

/**
 * Renser en rå aftalereference (fjerner tekniske UUID'er og formaterer ISO-datoer til dansk datoformat).
 */
export function cleanAppointmentReference(raw?: string | null): string {
  if (!raw) return "";
  let clean = raw.trim();

  const parenMatch = clean.match(/\(([^)]+)\)/);
  if (parenMatch) {
    clean = parenMatch[1].trim();
  }

  clean = clean.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ""
  );
  clean = clean.replace(/[\[\]\(\)]/g, " ").trim();
  clean = clean.replace(/^[#:\s-]+/, "").replace(/[#:\s-]+$/, "").trim();

  clean = clean.replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, y, m, d) => {
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "maj",
      "jun",
      "jul",
      "aug",
      "sep",
      "okt",
      "nov",
      "dec",
    ];
    const mIdx = parseInt(m, 10) - 1;
    const mStr = months[mIdx] || m;
    return `${parseInt(d, 10)}. ${mStr}. ${y}`;
  });

  clean = clean.replace(/kl\.\s*(\d{1,2}):(\d)(?!\d)/gi, "kl. $1:$20");
  clean = clean.replace(/\s{2,}/g, " ").trim();

  return clean || "Aftale";
}

/**
 * Klassificerer et JGit-commit i én af 4 kategorier (`APPOINTMENT`, `CONFIDENTIAL`, `THERAPIST`, `CLIENT`)
 * baseret på commit-besked, tekst-delta og forfatter.
 */
export function classifyCommit(
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

/**
 * Oversætter tekniske brugernavne fra JGit-commits (fx `bjens`, `anders_sand`) til læsbare visningsnavne.
 */
export function formatReadableAuthorName(
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

/**
 * Udtrækker strukturerede metadata (`moodScore`, `isShared`, `referencedCommitHash`, `referencedAppointment`)
 * fra et JGit-commits besked og Markdown-indhold.
 */
export function parseCommitMetadata(
  delta: string,
  snapshot: string,
  message?: string
): {
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

  const commitRefMatch = source.match(
    /(?:Refs-Commit|Tilknyttet\s*commit|Opfølgning\s*på\s*commit)\s*:\s*#?([a-f0-9]{6,40})/i
  );
  if (commitRefMatch) {
    referencedCommitHash = commitRefMatch[1];
  }

  const aptRefMatch = source.match(
    /(?:Refs-Appointment|Tilknyttet\s*aftale)\s*:\s*([^\n\r\]]+)/i
  );
  if (aptRefMatch) {
    referencedAppointment = aptRefMatch[1].trim();
  }

  return { moodScore, isShared, referencedCommitHash, referencedAppointment };
}

/**
 * Beregner 2-bogstavs avatar-initialer fra et forfatternavn (fx "Dr. Bo Jensen (Terapeut)" -> "BJ").
 */
export function computeInitials(author: string): string {
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

export default JournalFeatureView;
