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
import { SupportedUiLocale, useUiLocale } from "../i18n/I18nFeature";

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

interface JournalCopy {
  badge: string;
  heading: string;
  titlePlaceholder: string;
  contentPlaceholder: string;
  moodPlaceholder: string;
  shareWithTherapist: string;
  saveBtn: string;
  loadingText: string;
  moodLabel: string;
  deleteBtn: string;
  forbiddenNotice: string;
}

const JOURNAL_COPY: Record<SupportedUiLocale, JournalCopy> = {
  da: {
    badge: "Klinisk Journal",
    heading: "Klinisk & Personlig Journal",
    titlePlaceholder: "Titel på notat",
    contentPlaceholder: "Journalindhold",
    moodPlaceholder: "Humør (1-10)",
    shareWithTherapist: "Del med behandler",
    saveBtn: "Gem Notat",
    loadingText: "Indlæser...",
    moodLabel: "Humør",
    deleteBtn: "Slet",
    forbiddenNotice: "Kun terapeuter har adgang til klientjournaler.",
  },
  en: {
    badge: "Clinical Journal",
    heading: "Clinical & Personal Journal",
    titlePlaceholder: "Entry Title",
    contentPlaceholder: "Journal Content",
    moodPlaceholder: "Mood (1-10)",
    shareWithTherapist: "Share with Therapist",
    saveBtn: "Save Entry",
    loadingText: "Loading...",
    moodLabel: "Mood",
    deleteBtn: "Delete",
    forbiddenNotice: "Only therapists have access to client journals.",
  },
  fr: {
    badge: "Dossier Clinique",
    heading: "Journal Clinique & Personnel",
    titlePlaceholder: "Titre de la note",
    contentPlaceholder: "Contenu du journal",
    moodPlaceholder: "Humeur (1-10)",
    shareWithTherapist: "Partager avec le praticien",
    saveBtn: "Enregistrer",
    loadingText: "Chargement...",
    moodLabel: "Humeur",
    deleteBtn: "Supprimer",
    forbiddenNotice: "Seuls les praticiens ont accès aux dossiers des clients.",
  },
  es: {
    badge: "Diario Clínico",
    heading: "Diario Clínico y Personal",
    titlePlaceholder: "Título de la entrada",
    contentPlaceholder: "Contenido del diario",
    moodPlaceholder: "Estado de ánimo (1-10)",
    shareWithTherapist: "Compartir con el terapeuta",
    saveBtn: "Guardar Entrada",
    loadingText: "Cargando...",
    moodLabel: "Ánimo",
    deleteBtn: "Eliminar",
    forbiddenNotice: "Solo los terapeutas tienen acceso a los diarios clínicos de los clientes.",
  },
  de: {
    badge: "Klinisches Journal",
    heading: "Klinisches & Persönliches Journal",
    titlePlaceholder: "Eintragstitel",
    contentPlaceholder: "Journalinhalt",
    moodPlaceholder: "Stimmung (1-10)",
    shareWithTherapist: "Mit Therapeut teilen",
    saveBtn: "Eintrag speichern",
    loadingText: "Wird geladen...",
    moodLabel: "Stimmung",
    deleteBtn: "Löschen",
    forbiddenNotice: "Nur Therapeuten haben Zugriff auf Klientenjournale.",
  },
};

const JournalFeatureAuthorizedContent: React.FC = () => {
  const locale = useUiLocale();
  const copy = JOURNAL_COPY[locale];
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
    <div
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
      data-testid="journal-feature-view"
    >
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
          <i className="bi bi-journal-medical" aria-hidden="true" />
          {copy.badge}
        </span>
        <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">
          {copy.heading}
        </h2>
      </div>

      <ProblemAlert error={error} onDismiss={clearError} />

      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2.5">
        <input
          type="text"
          placeholder={copy.titlePlaceholder}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
          data-testid="input-journal-title"
        />
        <input
          type="text"
          placeholder={copy.contentPlaceholder}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-w-48 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
          data-testid="input-journal-content"
        />
        <input
          type="number"
          placeholder={copy.moodPlaceholder}
          value={moodRating}
          onChange={(e) => setMoodRating(e.target.value)}
          className="w-28 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
          data-testid="input-journal-mood"
        />
        <label className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
          <input
            type="checkbox"
            checked={sharedWithTherapist}
            onChange={(e) => setSharedWithTherapist(e.target.checked)}
            data-testid="input-journal-shared"
          />
          {copy.shareWithTherapist}
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          data-testid="submit-journal"
        >
          {copy.saveBtn}
        </button>
      </form>

      {loading && (
        <p data-testid="loading-indicator" className="text-sm text-slate-500">
          {copy.loadingText}
        </p>
      )}

      <ul className="space-y-2" data-testid="journal-list">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm"
          >
            <div>
              <strong className="text-slate-900">{item.title}</strong> —{" "}
              <span className="text-slate-700">
                {filterInternalNotes(item.content, false)}
              </span>{" "}
              {item.moodRating !== undefined && (
                <span className="ml-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800">
                  ({copy.moodLabel}: {item.moodRating}/10)
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => item.id && remove(item.id)}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              data-testid={`delete-journal-${item.id}`}
            >
              {copy.deleteBtn}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

const JournalForbiddenNotice: React.FC = () => {
  const locale = useUiLocale();
  return <p data-testid="forbidden-notice">{JOURNAL_COPY[locale].forbiddenNotice}</p>;
};

export const JournalFeatureView: React.FC = () => (
  <RoleGuard
    allowed={["PROVIDER"]}
    fallback={<JournalForbiddenNotice />}
  >
    <JournalFeatureAuthorizedContent />
  </RoleGuard>
);

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
