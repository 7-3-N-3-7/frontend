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
 * fortrolige behandlernoter (`INTERNAL_MEDICAL_NOTES`), fortolkning af
 * Eclipse JGit SHA-1 commit-historik samt Vertikal Semantisk Zoom-Tidslinje
 * (`Makro` / `Meso` / `Mikro`) til klinisk overblik.
 *
 * ARKITEKTONISK OVERBLIK:
 *   1. [Record/DTO: JournalEntryDto], [Record/DTO: TherapistClinicalNoteDto],
 *      [Record/DTO: TherapistNoteDto], [Record/DTO: GitCommitDto] &
 *      [Record/DTO: ClinicalJournalEvent]
 *   2. Defense-in-Depth Privatlivsfilter (#filterInternalNotes), JGit-domænefunktioner
 *      samt semantisk zoom-matematik (#resolveSemanticZoomTier, #computeThumbMetrics,
 *      #computeDragUpdate, #mapBundleToClinicalTimelineEvents).
 *   3. [Service: JournalApiService] (Modul-Privat — Information Hiding)
 *   4. [Hook: useBaseCrud<JournalEntryDto, string>(journalApi)]
 *   5. [Components: <JournalFeatureView />, <PatientTimelineContainer />,
 *      <SemanticTimelineStream />, <VerticalZoomScrollbar />, <JournalDetailInspector />]
 * ============================================================================
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BaseApiService,
  DomainGuard,
  ErrorCode,
  HasId,
} from "../../core/baseDomainCore";
import {
  ConfirmActionDialog,
  ProblemAlert,
  RoleGuard,
  useBaseCrud,
  useOptionalAuth,
} from "../../core/baseUiCore";
import {
  SupportedUiLocale,
  resolveUiLocale,
  useUiLocale,
} from "../i18n/I18nFeature";

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
  clientId?: string;
  clientUuid?: string;
  therapistId?: string;
  authorTherapistUuid?: string;
  authorTherapistName?: string;
  organisationName?: string;
  title?: string;
  content?: string;
  confidentialMarkdown?: string;
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
  clientUuid?: string;
  title: string;
  content: string;
  moodRating?: number;
  sharedWithTherapist?: boolean;
  sharedWithTherapists?: boolean;
  sharedTherapistUuids?: string[];
  gitBranch?: string;
  gitCommitHash?: string;
  timestamp?: string;
  createdAt?: string;
  updatedAt?: string;
  therapistNotes?: TherapistNoteDto[];
}

export type JournalEventCategory =
  | "sessions"
  | "goals"
  | "interventions"
  | "revisions";

export interface ClinicalJournalEvent {
  id: string;
  date: string; // ISO format: 'YYYY-MM-DD'
  timestamp?: string; // F.eks. '10:00–10:50'
  lane: JournalEventCategory;
  tag: string; // F.eks. 'Session #18', 'Diagnose & Mål', 'Tiltag', 'Revision v4.0'
  title: string;
  summary: string;
  version: string; // F.eks. 'v3.2'
  who5Score?: string; // F.eks. '68 / 100 (+12)'
  soap: {
    subjective: string; // S — Subjektivt
    objective: string; // O — Objektivt
    assessment: string; // A — Analyse / Vurdering
    plan: string; // P — Plan & Næste skridt
  };
  auditLog: string; // F.eks. 'Oprettet af aut. psykolog M. Vestergaard · Signeret'
}

export interface TimelineClientOption {
  id: string;
  label: string;
}

export type SemanticZoomTier = "macro" | "meso" | "micro";
export type ZoomDragMode = "zoomTop" | "scroll" | "zoomBottom";

interface ActiveTherapistHandshake {
  id?: string;
  therapistUuid: string;
  therapistName?: string;
  organisationName?: string;
  status?: string;
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
interface ClinicClientRecord {
  id?: string;
  userId?: string;
  fullName?: string;
  email?: string;
}

interface ClientJournalBundleResponse {
  clientUuid?: string;
  entries?: JournalEntryDto[];
  clinicalNotes?: TherapistClinicalNoteDto[];
}

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

  private async fetchJsonOrDefault<T>(url: string, fallback: T): Promise<T> {
    try {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) return fallback;
      return (await res.json()) as T;
    } catch {
      return fallback;
    }
  }

  async getClinicClients(
    excludeUserId?: string,
    excludeEmail?: string
  ): Promise<TimelineClientOption[]> {
    const raw = await this.fetchJsonOrDefault<ClinicClientRecord[]>(
      "/api/backend/clinic/clients",
      []
    );
    if (!Array.isArray(raw)) return [];
    const excludedId = excludeUserId?.trim() || "";
    const excludedMail = excludeEmail?.trim().toLowerCase() || "";
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const options: TimelineClientOption[] = [];
    for (const c of raw) {
      if (!c || typeof c !== "object") continue;
      const id = (c.userId || c.id || "").trim();
      if (!id || seenIds.has(id)) continue;
      if (excludedId && id === excludedId) continue;

      const fullName = typeof c.fullName === "string" ? c.fullName.trim() : "";
      const email = typeof c.email === "string" ? c.email.trim() : "";
      if (excludedMail && email.toLowerCase() === excludedMail) continue;
      if (fullName && (/^dr\.\s/i.test(fullName) || /_terapeut/i.test(fullName))) {
        continue;
      }

      const normalizedName = fullName.toLowerCase();
      if (normalizedName && seenNames.has(normalizedName)) continue;

      seenIds.add(id);
      if (normalizedName) seenNames.add(normalizedName);

      const label =
        fullName && email
          ? `${fullName} (${email})`
          : fullName || email || id;
      options.push({ id, label });
    }
    return options;
  }

  async getClientTimelineData(
    clientUuid: string,
    therapistUuid?: string
  ): Promise<{
    entries: JournalEntryDto[];
    clinicalNotes: TherapistClinicalNoteDto[];
    commits: GitCommitDto[];
  }> {
    const query = therapistUuid
      ? `?therapistUuid=${encodeURIComponent(therapistUuid)}`
      : "";
    const encodedClient = encodeURIComponent(clientUuid);
    const [bundle, commits] = await Promise.all([
      this.fetchJsonOrDefault<ClientJournalBundleResponse>(
        `/api/backend/journals/client/${encodedClient}${query}`,
        {}
      ),
      this.fetchJsonOrDefault<GitCommitDto[]>(
        `/api/backend/journals/history/${encodedClient}${query}`,
        []
      ),
    ]);
    return {
      entries: Array.isArray(bundle.entries) ? bundle.entries : [],
      clinicalNotes: Array.isArray(bundle.clinicalNotes)
        ? bundle.clinicalNotes
        : [],
      commits: Array.isArray(commits) ? commits : [],
    };
  }
}

const journalApi = new JournalApiService();

// ============================================================================
// 3. EXPORTED FEATURE VIEW (Beskyttet af <RoleGuard allowed={["PROVIDER"]}>)
// ============================================================================

interface JournalCopy {
  badge: string;
  clientBadge: string;
  heading: string;
  clientHeading: string;
  clientSubtitle: string;
  titleLabel: string;
  titlePlaceholder: string;
  contentLabel: string;
  contentPlaceholder: string;
  moodInputLabel: string;
  moodPlaceholder: string;
  shareWithTherapist: string;
  selectTherapistsLabel: string;
  noActiveHandshakesTip: string;
  sharedBadge: string;
  privateBadge: string;
  saveBtn: string;
  loadingText: string;
  moodLabel: string;
  deleteBtn: string;
  confirmDeleteTitle: string;
  confirmDeleteDesc: string;
  confirmDeleteBtn: string;
  cancelBtn: string;
  forbiddenNotice: string;
  clientForbiddenNotice: string;
  timelineToggleShow: string;
  timelineToggleHide: string;
  timelineBadge: string;
  timelineTitle: string;
  timelineSubtitle: string;
  timelineClientLabel: string;
  timelineDemoCaseLabel: string;
  timelineTierMacro: string;
  timelineTierMeso: string;
  timelineTierMicro: string;
  timelinePresetMacro: string;
  timelinePresetMeso: string;
  timelinePresetMicro: string;
  timelineFilterAll: string;
  timelineFilterSessions: string;
  timelineFilterGoals: string;
  timelineFilterInterventions: string;
  timelineFilterRevisions: string;
  timelineZoomLabel: string;
  timelineZoomAriaLabel: string;
  timelineZoomHint: string;
  timelineEmptyTitle: string;
  timelineEmptyAction: string;
  timelineSoapS: string;
  timelineSoapO: string;
  timelineSoapA: string;
  timelineSoapP: string;
  timelineAuditLabel: string;
  timelineInspectorTitle: string;
  timelineInspectorClose: string;
  timelineSignedBadge: string;
}

const JOURNAL_COPY: Record<SupportedUiLocale, JournalCopy> = {
  da: {
    badge: "Klinisk Journal",
    clientBadge: "Min Dagbog",
    heading: "Klinisk & Personlig Journal",
    clientHeading: "Min Personlige Dagbog & Refleksion",
    clientSubtitle:
      "Skriv daglige refleksioner og styr præcis hvilke godkendte behandlere der må læse dem.",
    titleLabel: "Titel",
    titlePlaceholder: "Titel på notat",
    contentLabel: "Refleksion & indhold",
    contentPlaceholder: "Skriv dine tanker eller refleksioner...",
    moodInputLabel: "Dagsform / humør (1–10)",
    moodPlaceholder: "1-10",
    shareWithTherapist: "Del med valgte behandlere",
    selectTherapistsLabel: "Vælg behandlere med adgang via aktivt samtykke:",
    noActiveHandshakesTip:
      "Du har endnu ingen aktive behandler-samtykker. Dine noter gemmes privat, indtil du godkender en behandler under Klinik & Praksis eller Samtykke.",
    sharedBadge: "Delt med behandler",
    privateBadge: "Privat",
    saveBtn: "Gem Notat",
    loadingText: "Indlæser...",
    moodLabel: "Humør",
    deleteBtn: "Slet",
    confirmDeleteTitle: "Slet dagbogsnotat?",
    confirmDeleteDesc: "Er du sikker på, at du vil fjerne dette notat?",
    confirmDeleteBtn: "Ja, slet notat",
    cancelBtn: "Annuller",
    forbiddenNotice: "Kun terapeuter har adgang til klientjournaler.",
    clientForbiddenNotice: "Log ind som klient for at åbne din personlige dagbog.",
    timelineToggleShow: "Åbn semantisk zoom-tidslinje",
    timelineToggleHide: "Skjul semantisk zoom-tidslinje",
    timelineBadge: "Semantisk Zoom-Tidslinje",
    timelineTitle: "Vertikal Patientjournal-tidslinje",
    timelineSubtitle:
      "Træk i zoom-scrollbjælken eller brug presets for at skifte mellem flerårigt overblik, kliniske resuméer og fulde SOAP-notater.",
    timelineClientLabel: "Patientforløb",
    timelineDemoCaseLabel: "Referenceforløb · Anna Mikkelsen (2024–2026)",
    timelineTierMacro: "Makro — Kompakt overblik",
    timelineTierMeso: "Meso — Kliniske kort",
    timelineTierMicro: "Mikro — Fuld SOAP & Audit",
    timelinePresetMacro: "Kompakt",
    timelinePresetMeso: "Overblik",
    timelinePresetMicro: "Fuld SOAP",
    timelineFilterAll: "Alle",
    timelineFilterSessions: "Sessioner",
    timelineFilterGoals: "Diagnose & Mål",
    timelineFilterInterventions: "Tiltag",
    timelineFilterRevisions: "Revisioner",
    timelineZoomLabel: "Detaljegrad",
    timelineZoomAriaLabel: "Zoom detaljegrad i patientjournal",
    timelineZoomHint: "+/- zoom · Pil op/ned ruller",
    timelineEmptyTitle: "Ingen journalposter matcher valgte klient eller kategori.",
    timelineEmptyAction: "Vis flerårigt referenceforløb (2024–2026)",
    timelineSoapS: "Subjektivt (S)",
    timelineSoapO: "Objektivt (O)",
    timelineSoapA: "Analyse (A)",
    timelineSoapP: "Plan (P)",
    timelineAuditLabel: "Revisionsspor",
    timelineInspectorTitle: "Detalje-inspektør — Klinisk SOAP & Audit",
    timelineInspectorClose: "Luk detaljevisning",
    timelineSignedBadge: "Signeret",
  },
  en: {
    badge: "Clinical Journal",
    clientBadge: "My Diary",
    heading: "Clinical & Personal Journal",
    clientHeading: "My Personal Diary & Reflections",
    clientSubtitle:
      "Write daily reflections and choose exactly which connected therapists may view them.",
    titleLabel: "Title",
    titlePlaceholder: "Entry Title",
    contentLabel: "Reflection & content",
    contentPlaceholder: "Write your thoughts or reflections...",
    moodInputLabel: "Mood rating (1–10)",
    moodPlaceholder: "1-10",
    shareWithTherapist: "Share with selected therapists",
    selectTherapistsLabel: "Choose therapists with an active handshake:",
    noActiveHandshakesTip:
      "You do not have any active therapist handshakes yet. Your entries stay private until you approve a therapist under Clinics or Consents.",
    sharedBadge: "Shared with therapist",
    privateBadge: "Private",
    saveBtn: "Save Entry",
    loadingText: "Loading...",
    moodLabel: "Mood",
    deleteBtn: "Delete",
    confirmDeleteTitle: "Delete journal entry?",
    confirmDeleteDesc: "Are you sure you want to remove this journal entry?",
    confirmDeleteBtn: "Yes, delete",
    cancelBtn: "Cancel",
    forbiddenNotice: "Only therapists have access to client journals.",
    clientForbiddenNotice: "Sign in as a client to access your personal diary.",
    timelineToggleShow: "Open semantic zoom timeline",
    timelineToggleHide: "Hide semantic zoom timeline",
    timelineBadge: "Semantic Zoom Timeline",
    timelineTitle: "Vertical Patient Journal Timeline",
    timelineSubtitle:
      "Drag the zoom scrollbar handles or choose a preset to move seamlessly between multi-year scanning, clinical cards, and full SOAP notes.",
    timelineClientLabel: "Patient record",
    timelineDemoCaseLabel: "Reference Case · Anna Mikkelsen (2024–2026)",
    timelineTierMacro: "Macro — Compact Overview",
    timelineTierMeso: "Meso — Clinical Cards",
    timelineTierMicro: "Micro — Full SOAP & Audit",
    timelinePresetMacro: "Compact",
    timelinePresetMeso: "Overview",
    timelinePresetMicro: "Full SOAP",
    timelineFilterAll: "All",
    timelineFilterSessions: "Sessions",
    timelineFilterGoals: "Diagnosis & Goals",
    timelineFilterInterventions: "Interventions",
    timelineFilterRevisions: "Revisions",
    timelineZoomLabel: "Detail Level",
    timelineZoomAriaLabel: "Zoom detail level in patient journal",
    timelineZoomHint: "+/- zoom · Up/Down scrolls",
    timelineEmptyTitle: "No journal events match the selected patient or category.",
    timelineEmptyAction: "Load multi-year reference case (2024–2026)",
    timelineSoapS: "Subjective (S)",
    timelineSoapO: "Objective (O)",
    timelineSoapA: "Assessment (A)",
    timelineSoapP: "Plan (P)",
    timelineAuditLabel: "Audit trail",
    timelineInspectorTitle: "Detail Inspector — Clinical SOAP & Audit",
    timelineInspectorClose: "Close detail inspector",
    timelineSignedBadge: "Signed",
  },
  fr: {
    badge: "Dossier Clinique",
    clientBadge: "Mon Journal",
    heading: "Journal Clinique & Personnel",
    clientHeading: "Mon Journal Personnel & Réflexions",
    clientSubtitle:
      "Rédigez vos réflexions quotidiennes et choisissez quels praticiens autorisés peuvent les consulter.",
    titleLabel: "Titre",
    titlePlaceholder: "Titre de la note",
    contentLabel: "Contenu du journal",
    contentPlaceholder: "Notez vos pensées ou réflexions...",
    moodInputLabel: "Humeur (1–10)",
    moodPlaceholder: "1-10",
    shareWithTherapist: "Partager avec les praticiens choisis",
    selectTherapistsLabel: "Praticiens disposant d'un consentement actif :",
    noActiveHandshakesTip:
      "Vous n'avez aucun consentement actif pour le moment. Vos notes restent privées jusqu'à l'accord d'un praticien.",
    sharedBadge: "Partagé avec le praticien",
    privateBadge: "Privé",
    saveBtn: "Enregistrer",
    loadingText: "Chargement...",
    moodLabel: "Humeur",
    deleteBtn: "Supprimer",
    confirmDeleteTitle: "Supprimer l'entrée ?",
    confirmDeleteDesc: "Voulez-vous vraiment supprimer cette note ?",
    confirmDeleteBtn: "Oui, supprimer",
    cancelBtn: "Annuler",
    forbiddenNotice: "Seuls les praticiens ont accès aux dossiers des clients.",
    clientForbiddenNotice: "Connectez-vous en tant que client pour ouvrir votre journal.",
    timelineToggleShow: "Ouvrir la chronologie à zoom sémantique",
    timelineToggleHide: "Masquer la chronologie",
    timelineBadge: "Chronologie Zoom Sémantique",
    timelineTitle: "Chronologie Verticale du Dossier Patient",
    timelineSubtitle:
      "Glissez les poignées de la barre de zoom ou utilisez les préréglages pour passer d'une vue pluriannuelle aux notes SOAP complètes.",
    timelineClientLabel: "Dossier patient",
    timelineDemoCaseLabel: "Cas de référence · Anna Mikkelsen (2024–2026)",
    timelineTierMacro: "Macro — Vue compacte",
    timelineTierMeso: "Méso — Cartes cliniques",
    timelineTierMicro: "Micro — SOAP complet & Audit",
    timelinePresetMacro: "Compact",
    timelinePresetMeso: "Aperçu",
    timelinePresetMicro: "SOAP complet",
    timelineFilterAll: "Tous",
    timelineFilterSessions: "Séances",
    timelineFilterGoals: "Diagnostic & Objectifs",
    timelineFilterInterventions: "Interventions",
    timelineFilterRevisions: "Révisions",
    timelineZoomLabel: "Niveau de détail",
    timelineZoomAriaLabel: "Zoom du niveau de détail du dossier patient",
    timelineZoomHint: "+/- zoom · Haut/Bas défile",
    timelineEmptyTitle: "Aucun événement ne correspond au patient ou à la catégorie.",
    timelineEmptyAction: "Afficher le cas pluriannuel (2024–2026)",
    timelineSoapS: "Subjectif (S)",
    timelineSoapO: "Objectif (O)",
    timelineSoapA: "Analyse (A)",
    timelineSoapP: "Plan (P)",
    timelineAuditLabel: "Journal d'audit",
    timelineInspectorTitle: "Inspecteur — SOAP Clinique & Audit",
    timelineInspectorClose: "Fermer l'inspecteur",
    timelineSignedBadge: "Signé",
  },
  es: {
    badge: "Diario Clínico",
    clientBadge: "Mi Diario",
    heading: "Diario Clínico y Personal",
    clientHeading: "Mi Diario Personal y Reflexiones",
    clientSubtitle:
      "Escribe tus reflexiones diarias y decide exactamente qué terapeutas autorizados pueden leerlas.",
    titleLabel: "Título",
    titlePlaceholder: "Título de la entrada",
    contentLabel: "Contenido del diario",
    contentPlaceholder: "Escribe tus pensamientos o reflexiones...",
    moodInputLabel: "Estado de ánimo (1–10)",
    moodPlaceholder: "1-10",
    shareWithTherapist: "Compartir con terapeutas seleccionados",
    selectTherapistsLabel: "Terapeutas con consentimiento activo:",
    noActiveHandshakesTip:
      "Aún no tienes consentimientos activos. Tus notas permanecerán privadas hasta autorizar a un terapeuta.",
    sharedBadge: "Compartido con terapeuta",
    privateBadge: "Privado",
    saveBtn: "Guardar Entrada",
    loadingText: "Cargando...",
    moodLabel: "Ánimo",
    deleteBtn: "Eliminar",
    confirmDeleteTitle: "¿Eliminar entrada?",
    confirmDeleteDesc: "¿Seguro que deseas eliminar esta nota del diario?",
    confirmDeleteBtn: "Sí, eliminar",
    cancelBtn: "Cancelar",
    forbiddenNotice: "Solo los terapeutas tienen acceso a los diarios clínicos de los clientes.",
    clientForbiddenNotice: "Inicia sesión como cliente para abrir tu diario personal.",
    timelineToggleShow: "Abrir línea de tiempo semántica",
    timelineToggleHide: "Ocultar línea de tiempo",
    timelineBadge: "Línea de Tiempo Semántica",
    timelineTitle: "Historial Clínico Vertical con Zoom Semántico",
    timelineSubtitle:
      "Arrastra la barra de zoom o usa los ajustes rápidos para alternar entre vista multianual, tarjetas clínicas y notas SOAP completas.",
    timelineClientLabel: "Historial del paciente",
    timelineDemoCaseLabel: "Caso clínico · Anna Mikkelsen (2024–2026)",
    timelineTierMacro: "Macro — Vista compacta",
    timelineTierMeso: "Meso — Tarjetas clínicas",
    timelineTierMicro: "Micro — SOAP completo y auditoría",
    timelinePresetMacro: "Compacto",
    timelinePresetMeso: "Resumen",
    timelinePresetMicro: "SOAP completo",
    timelineFilterAll: "Todos",
    timelineFilterSessions: "Sesiones",
    timelineFilterGoals: "Diagnóstico y Metas",
    timelineFilterInterventions: "Intervenciones",
    timelineFilterRevisions: "Revisiones",
    timelineZoomLabel: "Nivel de detalle",
    timelineZoomAriaLabel: "Ajustar nivel de detalle en historial clínico",
    timelineZoomHint: "+/- zoom · Arriba/Abajo desplaza",
    timelineEmptyTitle: "Ningún registro coincide con el paciente o la categoría.",
    timelineEmptyAction: "Ver historial clínico de referencia (2024–2026)",
    timelineSoapS: "Subjetivo (S)",
    timelineSoapO: "Objetivo (O)",
    timelineSoapA: "Análisis (A)",
    timelineSoapP: "Plan (P)",
    timelineAuditLabel: "Registro de auditoría",
    timelineInspectorTitle: "Inspector de Detalle — SOAP Clínico y Auditoría",
    timelineInspectorClose: "Cerrar inspector",
    timelineSignedBadge: "Firmado",
  },
  de: {
    badge: "Klinisches Journal",
    clientBadge: "Mein Tagebuch",
    heading: "Klinisches & Persönliches Journal",
    clientHeading: "Mein Persönliches Tagebuch & Reflexionen",
    clientSubtitle:
      "Schreiben Sie tägliche Reflexionen und bestimmen Sie genau, welche freigegebenen Therapeuten mitlesen dürfen.",
    titleLabel: "Titel",
    titlePlaceholder: "Eintragstitel",
    contentLabel: "Inhalt & Reflexion",
    contentPlaceholder: "Gedanken oder Reflexionen notieren...",
    moodInputLabel: "Stimmung (1–10)",
    moodPlaceholder: "1-10",
    shareWithTherapist: "Mit ausgewählten Therapeuten teilen",
    selectTherapistsLabel: "Therapeuten mit aktiver Einwilligung:",
    noActiveHandshakesTip:
      "Es liegt noch keine aktive Einwilligung vor. Ihre Einträge bleiben privat, bis Sie einen Therapeuten freigeben.",
    sharedBadge: "Mit Therapeut geteilt",
    privateBadge: "Privat",
    saveBtn: "Eintrag speichern",
    loadingText: "Wird geladen...",
    moodLabel: "Stimmung",
    deleteBtn: "Löschen",
    confirmDeleteTitle: "Eintrag löschen?",
    confirmDeleteDesc: "Möchten Sie diesen Tagebucheintrag wirklich entfernen?",
    confirmDeleteBtn: "Ja, löschen",
    cancelBtn: "Abbrechen",
    forbiddenNotice: "Nur Therapeuten haben Zugriff auf Klientenjournale.",
    clientForbiddenNotice: "Melden Sie sich als Klient an, um Ihr Tagebuch zu öffnen.",
    timelineToggleShow: "Semantische Zeitachse öffnen",
    timelineToggleHide: "Zeitachse ausblenden",
    timelineBadge: "Semantische Zoom-Zeitachse",
    timelineTitle: "Vertikale Patientenjournal-Zeitachse",
    timelineSubtitle:
      "Ziehen Sie die Zoom-Bildlaufleiste oder nutzen Sie Voreinstellungen zwischen mehrjährigem Überblick und vollständigen SOAP-Notizen.",
    timelineClientLabel: "Patientenakte",
    timelineDemoCaseLabel: "Referenzverlauf · Anna Mikkelsen (2024–2026)",
    timelineTierMacro: "Makro — Kompaktansicht",
    timelineTierMeso: "Meso — Klinische Karten",
    timelineTierMicro: "Mikro — Vollständiges SOAP & Audit",
    timelinePresetMacro: "Kompakt",
    timelinePresetMeso: "Überblick",
    timelinePresetMicro: "Voll-SOAP",
    timelineFilterAll: "Alle",
    timelineFilterSessions: "Sitzungen",
    timelineFilterGoals: "Diagnose & Ziele",
    timelineFilterInterventions: "Maßnahmen",
    timelineFilterRevisions: "Revisionen",
    timelineZoomLabel: "Detailstufe",
    timelineZoomAriaLabel: "Detailgrad in Patientenakte zoomen",
    timelineZoomHint: "+/- Zoom · Hoch/Runter scrollt",
    timelineEmptyTitle: "Keine Journaleinträge für den ausgewählten Klienten oder Filter.",
    timelineEmptyAction: "Mehrjährigen Referenzverlauf laden (2024–2026)",
    timelineSoapS: "Subjektiv (S)",
    timelineSoapO: "Objektiv (O)",
    timelineSoapA: "Analyse (A)",
    timelineSoapP: "Plan (P)",
    timelineAuditLabel: "Audit-Protokoll",
    timelineInspectorTitle: "Detailinspektor — Klinisches SOAP & Audit",
    timelineInspectorClose: "Detailansicht schließen",
    timelineSignedBadge: "Signiert",
  },
};

export interface JournalFeatureViewProps {
  portalMode?: "client" | "provider";
}

const JournalFeatureAuthorizedContent: React.FC<{
  portalMode: "client" | "provider";
}> = ({ portalMode }) => {
  const locale = useUiLocale();
  const copy = JOURNAL_COPY[locale];
  const auth = useOptionalAuth();
  const isClientMode = portalMode === "client";
  const { items, loading, error, create, remove, clearError } =
    useBaseCrud(journalApi);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [moodRating, setMoodRating] = useState("7");
  const [sharedWithTherapist, setSharedWithTherapist] = useState(!isClientMode);
  const [activeHandshakes, setActiveHandshakes] = useState<
    ActiveTherapistHandshake[]
  >([]);
  const [selectedTherapistUuids, setSelectedTherapistUuids] = useState<string[]>(
    []
  );
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);

  useEffect(() => {
    if (!isClientMode || !auth?.user.id) {
      return;
    }
    let cancelled = false;
    fetch(
      `/api/backend/clinic/handshakes/client/${encodeURIComponent(auth.user.id)}`,
      { credentials: "same-origin" }
    )
      .then(async (res) => (res.ok ? res.json() : []))
      .then((list) => {
        if (cancelled || !Array.isArray(list)) return;
        const active = (list as ActiveTherapistHandshake[]).filter(
          (hs) => (hs.status || "").toUpperCase() === "ACTIVE" && hs.therapistUuid
        );
        setActiveHandshakes(active);
        setSelectedTherapistUuids(active.map((hs) => hs.therapistUuid));
      })
      .catch(() => {
        // Fallback silently when running offline or in unit tests without handshake mocks
      });
    return () => {
      cancelled = true;
    };
  }, [isClientMode, auth?.user.id]);

  const toggleTherapistSelection = (therapistUuid: string) => {
    setSelectedTherapistUuids((prev) =>
      prev.includes(therapistUuid)
        ? prev.filter((id) => id !== therapistUuid)
        : [...prev, therapistUuid]
    );
  };

  const visibleItems = useMemo(() => {
    if (!isClientMode || !auth?.user.id) return items;
    return items.filter(
      (item) =>
        (!item.clientUuid && !item.userId) ||
        item.clientUuid === auth.user.id ||
        item.userId === auth.user.id
    );
  }, [items, isClientMode, auth?.user.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const shouldShare = isClientMode
      ? sharedWithTherapist && selectedTherapistUuids.length > 0
      : sharedWithTherapist;
    const created = await create({
      title,
      content,
      moodRating: Number(moodRating),
      sharedWithTherapist: shouldShare,
      sharedWithTherapists: shouldShare,
      sharedTherapistUuids: shouldShare ? selectedTherapistUuids : undefined,
      clientUuid: auth?.user.id || undefined,
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
            <i className="bi bi-journal-medical" aria-hidden="true" />
            {isClientMode ? copy.clientBadge : copy.badge}
          </span>
          <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">
            {isClientMode ? copy.clientHeading : copy.heading}
          </h2>
          {isClientMode && (
            <p className="mt-1 text-sm text-slate-600">{copy.clientSubtitle}</p>
          )}
        </div>
        {!isClientMode && (
          <button
            type="button"
            onClick={() => setShowTimeline((prev) => !prev)}
            data-testid="toggle-semantic-timeline"
            className="min-h-11 inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100"
          >
            <i className="bi bi-clock-history" aria-hidden="true" />
            {showTimeline ? copy.timelineToggleHide : copy.timelineToggleShow}
          </button>
        )}
      </div>

      {!isClientMode && showTimeline && (
        <div
          className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4"
          data-testid="inline-semantic-timeline-panel"
        >
          <PatientTimelineContainer skipRoleGuard locale={locale} />
        </div>
      )}

      <ProblemAlert error={error} onDismiss={clearError} />

      <ConfirmActionDialog
        open={pendingDeleteId !== null}
        title={copy.confirmDeleteTitle}
        description={copy.confirmDeleteDesc}
        confirmLabel={copy.confirmDeleteBtn}
        cancelLabel={copy.cancelBtn}
        tone="danger"
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          const targetId = pendingDeleteId;
          setPendingDeleteId(null);
          if (targetId) void remove(targetId);
        }}
      />

      <form noValidate onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 items-end">
          <div className="flex flex-col gap-1 sm:col-span-4">
            <label
              htmlFor="journal-title-input"
              className="text-xs font-semibold text-slate-600"
            >
              {copy.titleLabel}
            </label>
            <input
              id="journal-title-input"
              type="text"
              placeholder={copy.titlePlaceholder}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              data-testid="input-journal-title"
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-6">
            <label
              htmlFor="journal-content-input"
              className="text-xs font-semibold text-slate-600"
            >
              {copy.contentLabel}
            </label>
            <input
              id="journal-content-input"
              type="text"
              placeholder={copy.contentPlaceholder}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              data-testid="input-journal-content"
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label
              htmlFor="journal-mood-input"
              className="text-xs font-semibold text-slate-600"
            >
              {copy.moodInputLabel}
            </label>
            <input
              id="journal-mood-input"
              type="number"
              min={1}
              max={10}
              placeholder={copy.moodPlaceholder}
              value={moodRating}
              onChange={(e) => setMoodRating(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
              data-testid="input-journal-mood"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={sharedWithTherapist}
              onChange={(e) => setSharedWithTherapist(e.target.checked)}
              data-testid="input-journal-shared"
              className="h-4 w-4 accent-teal-700"
            />
            {copy.shareWithTherapist}
          </label>
          <button
            type="submit"
            disabled={loading}
            className="min-h-11 rounded-xl bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            data-testid="submit-journal"
          >
            {copy.saveBtn}
          </button>
        </div>

        {isClientMode && sharedWithTherapist && (
          <div
            data-testid="journal-handshake-sharing-box"
            className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 text-xs text-slate-700"
          >
            {activeHandshakes.length > 0 ? (
              <div className="space-y-2">
                <div className="font-semibold text-teal-900">
                  {copy.selectTherapistsLabel}
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeHandshakes.map((hs) => (
                    <label
                      key={hs.therapistUuid}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-teal-200 bg-white px-3 py-1.5 font-medium text-slate-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTherapistUuids.includes(hs.therapistUuid)}
                        onChange={() => toggleTherapistSelection(hs.therapistUuid)}
                        data-testid={`share-therapist-checkbox-${hs.therapistUuid}`}
                        className="h-4 w-4 accent-teal-700"
                      />
                      <span>
                        {hs.therapistName || hs.organisationName || copy.sharedBadge}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <p data-testid="no-active-handshakes-tip" className="m-0 text-teal-900">
                {copy.noActiveHandshakesTip}
              </p>
            )}
          </div>
        )}
      </form>

      {loading && (
        <p data-testid="loading-indicator" className="text-sm text-slate-500">
          {copy.loadingText}
        </p>
      )}

      <ul className="space-y-2" data-testid="journal-list">
        {visibleItems.map((item) => {
          const isShared =
            item.sharedWithTherapists ?? item.sharedWithTherapist ?? false;
          return (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-slate-900">{item.title}</strong>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      isShared
                        ? "bg-teal-50 text-teal-800 border border-teal-200"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {isShared ? copy.sharedBadge : copy.privateBadge}
                  </span>
                  {item.moodRating !== undefined && (
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-800">
                      {copy.moodLabel}: {item.moodRating}/10
                    </span>
                  )}
                </div>
                <p className="m-0 text-slate-700">
                  {filterInternalNotes(item.content, false)}
                </p>
              </div>
              {item.id && (
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(item.id!)}
                  className="min-h-11 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  data-testid={`delete-journal-${item.id}`}
                >
                  {copy.deleteBtn}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const JournalForbiddenNotice: React.FC<{ portalMode: "client" | "provider" }> = ({
  portalMode,
}) => {
  const locale = useUiLocale();
  const copy = JOURNAL_COPY[locale];
  return (
    <p data-testid="forbidden-notice">
      {portalMode === "client" ? copy.clientForbiddenNotice : copy.forbiddenNotice}
    </p>
  );
};

export const JournalFeatureView: React.FC<JournalFeatureViewProps> = ({
  portalMode = "provider",
}) => (
  <RoleGuard
    allowed={portalMode === "client" ? ["CLIENT"] : ["PROVIDER"]}
    fallback={<JournalForbiddenNotice portalMode={portalMode} />}
  >
    <JournalFeatureAuthorizedContent portalMode={portalMode} />
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

// ============================================================================
// 5. VERTIKAL SEMANTISK ZOOM-TIDSLINJE — DOMÆNELOGIK & MATEMATIK
// ============================================================================

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Oversætter en numerisk zoom-værdi (`15..100`) til ét af de tre semantiske
 * kortniveauer: `macro` (`< 38`), `meso` (`38..74`) eller `micro` (`>= 75`).
 */
export function resolveSemanticZoomTier(zoomLevel: number): SemanticZoomTier {
  if (zoomLevel < 38) return "macro";
  if (zoomLevel < 75) return "meso";
  return "micro";
}

/**
 * Beregner procenthøjde (`thumbHeightPct`) og vertikal position (`topPct`) for
 * `ViewportThumb` i `VerticalZoomScrollbar` i 1:1 overensstemmelse med spec §5.
 */
export function computeThumbMetrics(
  zoomLevel: number,
  scrollRatio: number
): { thumbHeightPct: number; maxTop: number; topPct: number } {
  const z = clampNumber(zoomLevel, 15, 100);
  const r = clampNumber(scrollRatio, 0, 1);
  const thumbHeightPct = Math.max(20, Math.min(85, 105 - z * 0.75));
  const maxTop = 100 - thumbHeightPct;
  const topPct = r * maxTop;
  return { thumbHeightPct, maxTop, topPct };
}

/**
 * Beregner næste `zoomLevel` og `scrollRatio` under træk i top-håndtag, bund-håndtag
 * eller midtersektion med sikkerhedsfaldback for JSDOM (`trackHeight <= 0 -> 240px`).
 */
export function computeDragUpdate(params: {
  mode: ZoomDragMode;
  dy: number;
  trackHeight: number;
  startZoom: number;
  startRatio: number;
  currentZoom: number;
}): { zoomLevel: number; scrollRatio: number } {
  const effectiveTrackHeight = params.trackHeight > 0 ? params.trackHeight : 240;
  if (params.mode === "zoomTop") {
    const zoomChange = Math.round((params.dy / effectiveTrackHeight) * 140);
    return {
      zoomLevel: clampNumber(params.startZoom + zoomChange, 15, 100),
      scrollRatio: clampNumber(params.startRatio, 0, 1),
    };
  }
  if (params.mode === "zoomBottom") {
    const zoomChange = Math.round((-params.dy / effectiveTrackHeight) * 140);
    return {
      zoomLevel: clampNumber(params.startZoom + zoomChange, 15, 100),
      scrollRatio: clampNumber(params.startRatio, 0, 1),
    };
  }
  const { thumbHeightPct } = computeThumbMetrics(
    params.currentZoom,
    params.startRatio
  );
  const usableSpan = Math.max(
    1,
    effectiveTrackHeight * (1 - thumbHeightPct / 100)
  );
  const deltaRatio = params.dy / usableSpan;
  return {
    zoomLevel: clampNumber(params.currentZoom, 15, 100),
    scrollRatio: clampNumber(params.startRatio + deltaRatio, 0, 1),
  };
}

const SOAP_DEFAULTS: Record<
  SupportedUiLocale,
  { o: string; a: string; p: string; signedBy: string }
> = {
  da: {
    o: "Klinisk observation dokumenteret i sessionen; stabil fremtoning.",
    a: "Forløbsvurdering opdateret i sammenhæng med aktuelle symptomer og trivsel.",
    p: "Fortsæt aftalte øvelser og evaluér effekt ved næste samtale.",
    signedBy: "Signeret i klinisk journal",
  },
  en: {
    o: "Clinical observation documented during session; calm affect noted.",
    a: "Clinical formulation updated relative to symptom trajectory and wellbeing.",
    p: "Continue agreed exercises and review progress at next appointment.",
    signedBy: "Signed in clinical record",
  },
  fr: {
    o: "Observation clinique consignée en séance ; présentation stable.",
    a: "Évaluation clinique mise à jour selon l'évolution symptomatique.",
    p: "Poursuivre les exercices convenus et réévaluer à la prochaine séance.",
    signedBy: "Signé au dossier clinique",
  },
  es: {
    o: "Observación clínica registrada en sesión; afecto estable.",
    a: "Evaluación clínica actualizada respecto a síntomas y bienestar.",
    p: "Continuar ejercicios acordados y revisar progreso en la próxima sesión.",
    signedBy: "Firmado en historial clínico",
  },
  de: {
    o: "Klinische Beobachtung in der Sitzung dokumentiert; stabiler Affekt.",
    a: "Klinische Einschätzung im Kontext von Symptomverlauf und Wohlbefinden.",
    p: "Vereinbarte Übungen fortführen und Verlauf im nächsten Termin prüfen.",
    signedBy: "Im klinischen Journal signiert",
  },
};

/**
 * Udtrækker strukturerede S/O/A/P-afsnit fra rå journaltekst eller genererer
 * sammenhængende klinisk fallback, når fritekst mangler eksplicitte S/O/A/P-markører.
 */
export function parseSoapSections(
  rawContent: string,
  fallbackSummary: string,
  locale: string = "da"
): ClinicalJournalEvent["soap"] {
  const uiLocale = resolveUiLocale(locale);
  const defaults = SOAP_DEFAULTS[uiLocale];
  const clean = filterInternalNotes(rawContent, true).trim();
  const lines = clean.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  let subjective = "";
  let objective = "";
  let assessment = "";
  let plan = "";

  for (const line of lines) {
    const sMatch = line.match(
      /^(?:S|Subjektivt|Subjective|Subjectif|Subjetivo|Subjektiv)(?:\s*\(S\))?\s*:\s*(.+)$/i
    );
    if (sMatch) {
      subjective = sMatch[1].trim();
      continue;
    }
    const oMatch = line.match(
      /^(?:O|Objektivt|Objective|Objectif|Objetivo|Objektiv)(?:\s*\(O\))?\s*:\s*(.+)$/i
    );
    if (oMatch) {
      objective = oMatch[1].trim();
      continue;
    }
    const aMatch = line.match(
      /^(?:A|Analyse(?:\s*\/\s*Vurdering)?|Assessment|Análisis)(?:\s*\(A\))?\s*:\s*(.+)$/i
    );
    if (aMatch) {
      assessment = aMatch[1].trim();
      continue;
    }
    const pMatch = line.match(
      /^(?:P|Plan(?:\s*&\s*Næste skridt)?)(?:\s*\(P\))?\s*:\s*(.+)$/i
    );
    if (pMatch) {
      plan = pMatch[1].trim();
    }
  }

  return {
    subjective: subjective || fallbackSummary || clean || defaults.o,
    objective: objective || defaults.o,
    assessment: assessment || defaults.a,
    plan: plan || defaults.p,
  };
}

function normalizeIsoDateAndTime(rawDate?: string): {
  date: string;
  timestamp?: string;
} {
  const trimmed = (rawDate || "").trim();
  const dateMatch = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
  const timeMatch = trimmed.match(/(\d{2}:\d{2})/);
  return {
    date: dateMatch ? dateMatch[1] : "2026-01-01",
    timestamp: timeMatch ? timeMatch[1] : undefined,
  };
}

function inferCategoryFromText(text: string): JournalEventCategory {
  const lower = text.toLowerCase();
  if (/(mål|diagnos|pcl-5|goal|objectif|meta|ziel)/.test(lower)) {
    return "goals";
  }
  if (/(tiltag|medicin|eksponering|intervention|mesure|medicación|maßnahme)/.test(lower)) {
    return "interventions";
  }
  return "sessions";
}

/**
 * Mapper backendens journalbundle (`entries`, `clinicalNotes`, `commits`) til
 * faldende kronologisk sorterede `ClinicalJournalEvent` objekter.
 */
export function mapBundleToClinicalTimelineEvents(
  input: {
    entries?: JournalEntryDto[];
    clinicalNotes?: TherapistClinicalNoteDto[];
    commits?: GitCommitDto[];
  },
  locale: string = "da"
): ClinicalJournalEvent[] {
  const uiLocale = resolveUiLocale(locale);
  const copy = JOURNAL_COPY[uiLocale];
  const signedLabel = SOAP_DEFAULTS[uiLocale].signedBy;
  const events: ClinicalJournalEvent[] = [];

  const chronologicalEntries = [...(input.entries || [])].sort((a, b) =>
    normalizeIsoDateAndTime(a.timestamp || a.createdAt).date.localeCompare(
      normalizeIsoDateAndTime(b.timestamp || b.createdAt).date
    )
  );

  let previousWho5: number | null = null;
  chronologicalEntries.forEach((entry, idx) => {
    const { date, timestamp } = normalizeIsoDateAndTime(
      entry.timestamp || entry.createdAt
    );
    const cleanedSummary = filterInternalNotes(entry.content, false).trim();
    const lane = inferCategoryFromText(`${entry.title} ${entry.content}`);
    let who5Score: string | undefined;
    if (typeof entry.moodRating === "number" && Number.isFinite(entry.moodRating)) {
      const score = Math.round(clampNumber(entry.moodRating, 1, 10) * 10);
      if (previousWho5 !== null) {
        const diff = score - previousWho5;
        who5Score = `${score} / 100 (${diff >= 0 ? `+${diff}` : diff})`;
      } else {
        who5Score = `${score} / 100`;
      }
      previousWho5 = score;
    }
    const sha = entry.gitCommitHash ? ` · #${entry.gitCommitHash.slice(0, 7)}` : "";
    events.push({
      id: entry.id || `entry-${idx + 1}`,
      date,
      timestamp,
      lane,
      tag:
        lane === "goals"
          ? copy.timelineFilterGoals
          : lane === "interventions"
            ? copy.timelineFilterInterventions
            : `${copy.timelineFilterSessions} #${idx + 1}`,
      title: entry.title,
      summary: cleanedSummary.slice(0, 220),
      version: `v${1 + Math.floor(idx / 3)}.${(idx % 3) + 1}`,
      who5Score,
      soap: parseSoapSections(entry.content, cleanedSummary, uiLocale),
      auditLog: `${copy.timelineAuditLabel}: ${signedLabel}${sha}`,
    });
  });

  (input.clinicalNotes || []).forEach((note, idx) => {
    const markdown = note.confidentialMarkdown || note.content || "";
    const { date, timestamp } = normalizeIsoDateAndTime(note.createdAt);
    const author =
      note.authorTherapistName || note.organisationName || copy.timelineBadge;
    const lane = inferCategoryFromText(`${note.title || ""} ${markdown}`);
    const sha = note.gitCommitHash ? ` · #${note.gitCommitHash.slice(0, 7)}` : "";
    events.push({
      id: note.id || `clinical-note-${idx + 1}`,
      date,
      timestamp,
      lane,
      tag: note.organisationName || copy.badge,
      title: note.title || `${copy.badge} · ${author}`,
      summary: markdown.replace(/\s+/g, " ").trim().slice(0, 220),
      version: `v2.${idx}`,
      soap: parseSoapSections(markdown, markdown, uiLocale),
      auditLog: `${author} · ${copy.timelineSignedBadge}${sha}`,
    });
  });

  (input.commits || []).forEach((commit, idx) => {
    const { date, timestamp } = normalizeIsoDateAndTime(commit.timestamp);
    const readableAuthor = formatReadableAuthorName(
      commit.author,
      classifyCommit(commit.message, commit.snapshot, commit.author)
    );
    const shortHash = (commit.commitHash || "HEAD").slice(0, 7);
    const summaryText = (commit.snapshot || commit.message || "").trim();
    events.push({
      id: `commit-${shortHash}-${idx}`,
      date,
      timestamp,
      lane: "revisions",
      tag: `Revision #${shortHash}`,
      title: commit.message || `JGit Revision #${shortHash}`,
      summary: summaryText.slice(0, 220),
      version: `v${events.length + 1}.0`,
      soap: parseSoapSections(commit.snapshot, commit.message, uiLocale),
      auditLog: `${readableAuthor} · JGit #${shortHash} · ${copy.timelineSignedBadge}`,
    });
  });

  return events.sort((a, b) => b.date.localeCompare(a.date));
}

const REFERENCE_TIMELINE_SEED: Array<{
  id: string;
  date: string;
  timestamp: string;
  lane: JournalEventCategory;
  version: string;
  who5Score?: string;
  tagByLocale: Record<SupportedUiLocale, string>;
  titleByLocale: Record<SupportedUiLocale, string>;
  summaryByLocale: Record<SupportedUiLocale, string>;
  soapByLocale: Record<SupportedUiLocale, ClinicalJournalEvent["soap"]>;
  auditByLocale: Record<SupportedUiLocale, string>;
}> = [
  {
    id: "ref-2026-session-18",
    date: "2026-10-14",
    timestamp: "10:00–10:50",
    lane: "sessions",
    version: "v4.2",
    who5Score: "76 / 100 (+8)",
    tagByLocale: {
      da: "Session #18",
      en: "Session #18",
      fr: "Séance #18",
      es: "Sesión #18",
      de: "Sitzung #18",
    },
    titleByLocale: {
      da: "Konsolidering af søvnrytme & eksponering i offentlig transport",
      en: "Consolidating sleep rhythm & public transport exposure",
      fr: "Consolidation du sommeil et exposition dans les transports",
      es: "Consolidación del sueño y exposición en transporte público",
      de: "Stabilisierung des Schlafrhythmus & ÖPNV-Exposition",
    },
    summaryByLocale: {
      da: "Klienten rapporterer fire sammenhængende uger uden mareridt og gennemførte to togrejser alene uden sikkerhedsadfærd.",
      en: "Client reports four consecutive weeks without nightmares and completed two solo train trips without safety behaviors.",
      fr: "La patiente rapporte quatre semaines sans cauchemars et deux trajets en train effectués seule sans comportement de sécurité.",
      es: "La paciente refiere cuatro semanas seguidas sin pesadillas y completó dos viajes en tren sola sin conductas de seguridad.",
      de: "Klientin berichtet vier Wochen ohne Albträume und absolvierte zwei Zugfahrten allein ohne Sicherheitsverhalten.",
    },
    soapByLocale: {
      da: {
        subjective: "Oplever markant ro om aftenen; bruger 4-7-8 vejrtrækning ved let uro på stationen.",
        objective: "Rolig øjenkontakt, jævn tale, ingen psykomotorisk uro under genkaldelse.",
        assessment: "PCL-5 totalscore faldet til 22 (under klinisk tærskel). Meget god behandlingsrespons.",
        plan: "Overgang til månedlig vedligeholdelsessamtale og udarbejdelse af tilbagefaldsplan i Session #19.",
      },
      en: {
        subjective: "Feels markedly calmer in the evening; uses 4-7-8 breathing when mild station tension arises.",
        objective: "Steady eye contact, measured speech, no psychomotor agitation during recall.",
        assessment: "PCL-5 total dropped to 22 (below clinical cutoff). Strong sustained treatment response.",
        plan: "Transition to monthly booster check-ins and finalize relapse-prevention blueprint in Session #19.",
      },
      fr: {
        subjective: "Se sent nettement plus apaisée le soir ; utilise la respiration 4-7-8 en gare.",
        objective: "Contact visuel stable, débit calme, aucune agitation psychomotrice.",
        assessment: "Score PCL-5 réduit à 22 (sous le seuil clinique). Excellente réponse thérapeutique.",
        plan: "Passer aux séances mensuelles de maintien et finaliser le plan de prévention en Séance #19.",
      },
      es: {
        subjective: "Refiere mayor calma nocturna; aplica respiración 4-7-8 ante tensión leve en la estación.",
        objective: "Contacto visual firme, habla pausada, sin agitación psicomotora.",
        assessment: "PCL-5 total descendió a 22 (bajo umbral clínico). Excelente respuesta terapéutica.",
        plan: "Pasar a seguimiento mensual de mantenimiento y cerrar plan de prevención en Sesión #19.",
      },
      de: {
        subjective: "Abends deutlich ruhiger; nutzt 4-7-8-Atmung bei leichter Unruhe am Bahnhof.",
        objective: "Ruhiger Blickkontakt, gleichmäßige Sprache, keine psychomotorische Unruhe.",
        assessment: "PCL-5-Gesamtwert auf 22 gesunken (unter klinischer Schwelle). Sehr gutes Ansprechen.",
        plan: "Übergang zu monatlichen Erhaltungsgesprächen und Rückfallplan in Sitzung #19.",
      },
    },
    auditByLocale: {
      da: "Oprettet af aut. psykolog M. Vestergaard · Signeret · #8f31c0a",
      en: "Authored by Lic. Psychologist M. Vestergaard · Signed · #8f31c0a",
      fr: "Rédigé par Psychologue M. Vestergaard · Signé · #8f31c0a",
      es: "Creado por Psicóloga M. Vestergaard · Firmado · #8f31c0a",
      de: "Erstellt von Psychologin M. Vestergaard · Signiert · #8f31c0a",
    },
  },
  {
    id: "ref-2026-revision-4",
    date: "2026-08-21",
    timestamp: "14:15",
    lane: "revisions",
    version: "v4.0",
    who5Score: "68 / 100 (+12)",
    tagByLocale: {
      da: "Revision v4.0",
      en: "Revision v4.0",
      fr: "Révision v4.0",
      es: "Revisión v4.0",
      de: "Revision v4.0",
    },
    titleByLocale: {
      da: "Halvårlig epikrise-opdatering & JGit samtykke-snapshot",
      en: "Semi-annual clinical epicrisis & JGit consent snapshot",
      fr: "Mise à jour de synthèse semestrielle & instantané JGit",
      es: "Actualización semestral clínica e instantánea JGit",
      de: "Halbjährliche Epikrise & JGit-Einwilligungs-Snapshot",
    },
    summaryByLocale: {
      da: "Skriftlig status til egen læge godkendt via aktivt klient-handshake; ingen medicinændringer nødvendige.",
      en: "Progress summary for GP approved via active client handshake; no medication changes indicated.",
      fr: "Synthèse pour le médecin traitant validée par consentement client ; aucun ajustement médicamenteux.",
      es: "Resumen para médico de cabecera aprobado mediante handshake activo; sin cambios de medicación.",
      de: "Verlaufsbericht für Hausarzt über aktiven Klienten-Handshake freigegeben; keine Medikationsänderung.",
    },
    soapByLocale: {
      da: {
        subjective: "Klienten godkendte deling af delmål fra hovedsporet med egen læge.",
        objective: "SHA-1 revisionskæde verificeret uden konflikter på branch `main`.",
        assessment: "Stabil fremgang i arbejdsevne; tilbagevenden til fuld arbejdstid aftalt med arbejdsgiver.",
        plan: "Afvent opfølgende PCL-5 måling om 6 uger.",
      },
      en: {
        subjective: "Client approved sharing milestone outcomes from `main` branch with GP.",
        objective: "SHA-1 revision chain verified cleanly on `main`.",
        assessment: "Sustained occupational functioning recovery; full-time return agreed.",
        plan: "Await follow-up PCL-5 assessment in 6 weeks.",
      },
      fr: {
        subjective: "La patiente a approuvé le partage des objectifs avec son médecin.",
        objective: "Chaîne SHA-1 vérifiée sans conflit sur `main`.",
        assessment: "Reprise stable du fonctionnement professionnel à temps plein.",
        plan: "Attendre l'évaluation PCL-5 de suivi dans 6 semaines.",
      },
      es: {
        subjective: "Paciente aprobó compartir hitos de la rama principal con su médico.",
        objective: "Cadena SHA-1 verificada sin conflictos en `main`.",
        assessment: "Recuperación sostenida de la capacidad laboral.",
        plan: "Esperar evaluación PCL-5 de control en 6 semanas.",
      },
      de: {
        subjective: "Klientin genehmigte Weitergabe der Meilensteine an den Hausarzt.",
        objective: "SHA-1-Revisionskette auf `main` konfliktfrei verifiziert.",
        assessment: "Stabile berufliche Wiedereingliederung in Vollzeit vereinbart.",
        plan: "Nächste PCL-5-Verlaufsmessung in 6 Wochen abwarten.",
      },
    },
    auditByLocale: {
      da: "Oprettet af aut. psykolog B. Jensen · Signeret · #4c9a12e",
      en: "Authored by Lic. Psychologist B. Jensen · Signed · #4c9a12e",
      fr: "Rédigé par Psychologue B. Jensen · Signé · #4c9a12e",
      es: "Creado por Psicólogo B. Jensen · Firmado · #4c9a12e",
      de: "Erstellt von Psychologe B. Jensen · Signiert · #4c9a12e",
    },
  },
  {
    id: "ref-2026-intervention-sleep",
    date: "2026-03-11",
    timestamp: "09:30–10:20",
    lane: "interventions",
    version: "v3.2",
    who5Score: "56 / 100 (+8)",
    tagByLocale: { da: "Tiltag", en: "Intervention", fr: "Intervention", es: "Intervención", de: "Maßnahme" },
    titleByLocale: {
      da: "IRT (Imagery Rehearsal Therapy) mod natlige påtrængende minder",
      en: "IRT (Imagery Rehearsal Therapy) for nocturnal intrusions",
      fr: "Thérapie IRT pour les intrusions nocturnes",
      es: "Terapia IRT para intrusiones nocturnas",
      de: "IRT (Imagery Rehearsal Therapy) gegen nächtliche Intrusionen",
    },
    summaryByLocale: {
      da: "Indført struktureret 15-minutters dagsøvelse med omskrivning af tilbagevendende drømmescenarie samt fast skærmfri afslutning kl. 21:30.",
      en: "Introduced 15-minute daytime nightmare rescripting protocol and screen-free wind-down at 21:30.",
      fr: "Introduction du protocole IRT de 15 min en journée et arrêt des écrans à 21h30.",
      es: "Implementado protocolo diurno IRT de 15 min y descanso sin pantallas desde las 21:30.",
      de: "Tägliches 15-Minuten-IRT-Protokoll sowie bildschirmfreie Abendroutine ab 21:30 eingeführt.",
    },
    soapByLocale: {
      da: {
        subjective: "Vågner kun 1 gang pr. nat mod tidligere 3–4 gange; hurtigere indsovning.",
        objective: "Søvndagbog medbragt for alle 14 dage; god compliance.",
        assessment: "Hyperarousal om aftenen aftager parallelt med fast stimuluskontrol.",
        plan: "Fortsæt IRT-omskrivning dagligt og tilføj gradueret tog-eksponering i maj.",
      },
      en: {
        subjective: "Waking once per night vs. 3–4 times previously; faster sleep onset.",
        objective: "14-day sleep log completed in full; strong adherence.",
        assessment: "Evening hyperarousal subsiding alongside consistent stimulus control.",
        plan: "Continue daily IRT rescripting and add graded train exposure in May.",
      },
      fr: {
        subjective: "Un seul réveil nocturne contre 3 à 4 auparavant ; endormissement plus rapide.",
        objective: "Agenda du sommeil rempli sur 14 jours ; bonne adhésion.",
        assessment: "Diminution de l'hypervigilance nocturne grâce au contrôle des stimuli.",
        plan: "Poursuivre l'IRT quotidienne et planifier l'exposition graduée en mai.",
      },
      es: {
        subjective: "Un despertar por noche frente a 3–4 antes; conciliación más rápida.",
        objective: "Diario de sueño de 14 días completo; alta adherencia.",
        assessment: "Hiperactivación nocturna en descenso gracias al control de estímulos.",
        plan: "Mantener IRT diaria e iniciar exposición gradual en mayo.",
      },
      de: {
        subjective: "Nur noch ein nächtliches Erwachen statt 3–4; schnelleres Einschlafen.",
        objective: "14-Tage-Schlaftagebuch vollständig vorgelegt; hohe Adhärenz.",
        assessment: "Nächtliches Hyperarousal nimmt durch konsequente Stimuluskontrolle ab.",
        plan: "Tägliche IRT fortsetzen und ab Mai graduierte Zug-Exposition ergänzen.",
      },
    },
    auditByLocale: {
      da: "Oprettet af aut. psykolog M. Vestergaard · Signeret",
      en: "Authored by Lic. Psychologist M. Vestergaard · Signed",
      fr: "Rédigé par Psychologue M. Vestergaard · Signé",
      es: "Creado por Psicóloga M. Vestergaard · Firmado",
      de: "Erstellt von Psychologin M. Vestergaard · Signiert",
    },
  },
  {
    id: "ref-2025-emdr",
    date: "2025-11-05",
    timestamp: "11:00–12:00",
    lane: "sessions",
    version: "v2.4",
    who5Score: "48 / 100 (+6)",
    tagByLocale: { da: "Session #11", en: "Session #11", fr: "Séance #11", es: "Sesión #11", de: "Sitzung #11" },
    titleByLocale: {
      da: "EMDR Fase 4 — Desensibilisering af primær ulykkessekvens",
      en: "EMDR Phase 4 — Desensitization of index incident memory",
      fr: "EMDR Phase 4 — Désensibilisation du souvenir traumatique cible",
      es: "EMDR Fase 4 — Desensibilización del recuerdo traumático índice",
      de: "EMDR Phase 4 — Desensibilisierung der primären Traumaerinnerung",
    },
    summaryByLocale: {
      da: "SUD faldt fra 8/10 til 3/10 efter bilaterale sæt. Klienten forblev inden for tolerancevinduet under hele sessionen.",
      en: "SUD decreased from 8/10 to 3/10 across bilateral sets while remaining within window of tolerance.",
      fr: "SUD abaissé de 8/10 à 3/10 durant les stimulations bilatérales dans la fenêtre de tolérance.",
      es: "SUD bajó de 8/10 a 3/10 tras estimulación bilateral dentro de la ventana de tolerancia.",
      de: "SUD sank von 8/10 auf 3/10 innerhalb des Toleranzfensters unter bilateraler Stimulation.",
    },
    soapByLocale: {
      da: {
        subjective: "Fysisk trykken for brystet lettede efter 4. sæt øjenbevægelser.",
        objective: "God jordforbindelse ved afslutning; brugte trygt-sted øvelse i 5 min.",
        assessment: "Adaptiv informationsbearbejdning i gang; mindre undgåelse omkring ulykkesstedet.",
        plan: "Planlæg installation af positiv kognition ('Jeg er i sikkerhed nu') ved næste session.",
      },
      en: {
        subjective: "Chest tightness eased markedly after the fourth set of eye movements.",
        objective: "Well grounded at session close; practiced safe-place stabilization for 5 min.",
        assessment: "Adaptive memory processing progressing; avoidance around incident site decreasing.",
        plan: "Install positive cognition ('I am safe now') in upcoming session.",
      },
      fr: {
        subjective: "La tension thoracique s'est relâchée après la 4e série de mouvements oculaires.",
        objective: "Bon ancrage en fin de séance ; exercice du lieu sûr pratiqué 5 minutes.",
        assessment: "Traitement adaptatif engagé ; baisse de l'évitement lié au lieu.",
        plan: "Installer la cognition positive (« Je suis en sécurité maintenant ») à la prochaine séance.",
      },
      es: {
        subjective: "Opresión torácica disminuyó notablemente tras la cuarta serie bilateral.",
        objective: "Buen arraigo al cierre; 5 min de ejercicio de lugar seguro.",
        assessment: "Procesamiento adaptativo activo; menor evitación de la zona.",
        plan: "Instalar cognición positiva («Ahora estoy a salvo») en la siguiente sesión.",
      },
      de: {
        subjective: "Engegefühl in der Brust löste sich nach dem 4. Set deutlich.",
        objective: "Zum Sitzungsende gut geerdet; 5 Min. Übung zum sicheren Ort.",
        assessment: "Adaptive Informationsverarbeitung aktiv; weniger Vermeidung des Unfallorts.",
        plan: "Installation der positiven Kognition ('Ich bin jetzt sicher') im nächsten Termin.",
      },
    },
    auditByLocale: {
      da: "Oprettet af aut. psykolog M. Vestergaard · Signeret",
      en: "Authored by Lic. Psychologist M. Vestergaard · Signed",
      fr: "Rédigé par Psychologue M. Vestergaard · Signé",
      es: "Creado por Psicóloga M. Vestergaard · Firmado",
      de: "Erstellt von Psychologin M. Vestergaard · Signiert",
    },
  },
  {
    id: "ref-2025-goal-update",
    date: "2025-04-18",
    timestamp: "13:00–13:50",
    lane: "goals",
    version: "v2.0",
    who5Score: "42 / 100 (+6)",
    tagByLocale: {
      da: "Diagnose & Mål",
      en: "Diagnosis & Goals",
      fr: "Diagnostic & Objectifs",
      es: "Diagnóstico & Metas",
      de: "Diagnose & Ziele",
    },
    titleByLocale: {
      da: "Behandlingsmål revideret: Delvis genoptagelse af deltidsarbejde",
      en: "Revised treatment goal: Graded return to part-time work",
      fr: "Révision d'objectif : reprise progressive à temps partiel",
      es: "Objetivo revisado: reincorporación gradual a tiempo parcial",
      de: "Therapieziel aktualisiert: Schrittweise Teilzeit-Rückkehr",
    },
    summaryByLocale: {
      da: "Fokus udvidet fra ren symptomstabilisering til gradueret arbejdspladstræning 12 timer ugentligt.",
      en: "Shifted focus from stabilization alone to graded 12h/week workplace re-entry.",
      fr: "Passage de la stabilisation pure à une reprise graduée de 12 h/semaine.",
      es: "Enfoque ampliado hacia reincorporación laboral gradual de 12 horas semanales.",
      de: "Fokus von reiner Stabilisierung auf stufenweisen Wiedereinstieg (12 Std./Woche) erweitert.",
    },
    soapByLocale: {
      da: {
        subjective: "Ønsker aktivt at vende tilbage til kollegerne 3 formiddage om ugen.",
        objective: "PCL-5 forbedret fra 51 til 38; lavere irritabilitet.",
        assessment: "Vurderes klar til støttet arbejdsstart med klare pauser.",
        plan: "Opdatér behandlingsplan og påbegynd traumefokuseret EMDR efter sommer.",
      },
      en: {
        subjective: "Eager to reconnect with colleagues across three mornings per week.",
        objective: "PCL-5 improved from 51 to 38; lower irritability.",
        assessment: "Clinically ready for supported workplace schedule with structured breaks.",
        plan: "Update care plan and initiate trauma-focused EMDR after summer.",
      },
      fr: {
        subjective: "Souhaite retrouver ses collègues trois matinées par semaine.",
        objective: "PCL-5 passé de 51 à 38 ; irritabilité réduite.",
        assessment: "Prête pour une reprise encadrée avec pauses planifiées.",
        plan: "Actualiser le plan de soins et débuter l'EMDR après l'été.",
      },
      es: {
        subjective: "Desea reincorporarse con sus compañeros tres mañanas por semana.",
        objective: "PCL-5 bajó de 51 a 38; menor irritabilidad.",
        assessment: "Apta para inicio laboral supervisado con pausas estructuradas.",
        plan: "Actualizar plan clínico e iniciar EMDR focalizada tras el verano.",
      },
      de: {
        subjective: "Möchte aktiv an drei Vormittagen zu den Kollegen zurückkehren.",
        objective: "PCL-5 von 51 auf 38 verbessert; geringere Reizbarkeit.",
        assessment: "Bereit für unterstützten Einstieg mit festen Pausen.",
        plan: "Behandlungsplan fortschreiben und nach dem Sommer EMDR beginnen.",
      },
    },
    auditByLocale: {
      da: "Oprettet af aut. psykolog B. Jensen · Signeret",
      en: "Authored by Lic. Psychologist B. Jensen · Signed",
      fr: "Rédigé par Psychologue B. Jensen · Signé",
      es: "Creado por Psicólogo B. Jensen · Firmado",
      de: "Erstellt von Psychologe B. Jensen · Signiert",
    },
  },
  {
    id: "ref-2024-intake-diagnosis",
    date: "2024-09-12",
    timestamp: "10:00–11:15",
    lane: "goals",
    version: "v1.0",
    who5Score: "36 / 100",
    tagByLocale: {
      da: "Diagnose & Mål",
      en: "Diagnosis & Goals",
      fr: "Diagnostic & Objectifs",
      es: "Diagnóstico & Metas",
      de: "Diagnose & Ziele",
    },
    titleByLocale: {
      da: "Indledende udredning: ICD-10 F43.1 PTSD & opstartsmål",
      en: "Initial clinical intake: ICD-10 F43.1 PTSD & baseline goals",
      fr: "Bilan initial : CIM-10 F43.1 TSPT & objectifs de base",
      es: "Evaluación inicial: CIE-10 F43.1 TEPT y objetivos base",
      de: "Erstbefund: ICD-10 F43.1 PTBS & Basisziele",
    },
    summaryByLocale: {
      da: "Baseline PCL-5 score 51/80 efter arbejdsrelateret hændelse. Første fokus er tryghed, søvnstabilisering og psykoedukation.",
      en: "Baseline PCL-5 score 51/80 following workplace incident. Initial focus on safety, sleep stabilization, and psychoeducation.",
      fr: "Score initial PCL-5 à 51/80 suite à un incident professionnel. Priorité à la sécurité et au sommeil.",
      es: "Puntuación inicial PCL-5 de 51/80 tras incidente laboral. Prioridad en seguridad y estabilización del sueño.",
      de: "Ausgangswert PCL-5 bei 51/80 nach Arbeitsunfall. Erstfokus auf Sicherheit und Schlafstabilisierung.",
    },
    soapByLocale: {
      da: {
        subjective: "Oplever flashbacks, udtalt vagtsomhed og undgår togstationer siden juni 2024.",
        objective: "Velorienteret i tid/sted; forhøjet autonom spænding under anamnese.",
        assessment: "Opfylder kriterier for PTSD (F43.1). Ingen aktuel suicidalrisiko.",
        plan: "Etablér stabiliseringsforløb over 6 sessioner før traumebearbejdning.",
      },
      en: {
        subjective: "Experiencing flashbacks, hypervigilance, and avoidance of train stations since June 2024.",
        objective: "Fully oriented; elevated autonomic tension during history taking.",
        assessment: "Meets criteria for PTSD (F43.1). No acute suicidality.",
        plan: "Establish 6-session stabilization phase prior to trauma processing.",
      },
      fr: {
        subjective: "Reviviscences, hypervigilance et évitement des gares depuis juin 2024.",
        objective: "Orientation conservée ; tension neurovégétative marquée à l'anamnèse.",
        assessment: "Critères cliniques de TSPT (F43.1) réunis. Aucun risque suicidaire aigu.",
        plan: "Mettre en place 6 séances de stabilisation avant le retraitement.",
      },
      es: {
        subjective: "Presenta reviviscencias, hipervigilancia y evitación de estaciones desde junio 2024.",
        objective: "Orientada en tiempo y espacio; tensión autonómica elevada en anamnesis.",
        assessment: "Cumple criterios de TEPT (F43.1). Sin riesgo suicida agudo.",
        plan: "Establecer fase de estabilización de 6 sesiones antes de procesar el trauma.",
      },
      de: {
        subjective: "Berichtet Flashbacks, Hypervigilanz und Vermeidung von Bahnhöfen seit Juni 2024.",
        objective: "Voll orientiert; erhöhte vegetative Anspannung während der Anamnese.",
        assessment: "Kriterien einer PTBS (F43.1) erfüllt. Keine akute Suizidalität.",
        plan: "6 Stabilisierungssitzungen vor Beginn der Traumakonfrontation.",
      },
    },
    auditByLocale: {
      da: "Oprettet af aut. psykolog B. Jensen · Signeret · #102ab7f",
      en: "Authored by Lic. Psychologist B. Jensen · Signed · #102ab7f",
      fr: "Rédigé par Psychologue B. Jensen · Signé · #102ab7f",
      es: "Creado por Psicólogo B. Jensen · Firmado · #102ab7f",
      de: "Erstellt von Psychologe B. Jensen · Signiert · #102ab7f",
    },
  },
];

/**
 * Returnerer et flerårigt klinisk referenceforløb (`2024–2026`) på alle 5 sprog
 * sorteret faldende efter dato, så terapeuten kan afprøve Makro/Meso/Mikro direkte.
 */
export function getReferenceClinicalTimelineEvents(
  locale: string = "da"
): ClinicalJournalEvent[] {
  const uiLocale = resolveUiLocale(locale);
  return REFERENCE_TIMELINE_SEED.map((item) => ({
    id: item.id,
    date: item.date,
    timestamp: item.timestamp,
    lane: item.lane,
    tag: item.tagByLocale[uiLocale],
    title: item.titleByLocale[uiLocale],
    summary: item.summaryByLocale[uiLocale],
    version: item.version,
    who5Score: item.who5Score,
    soap: item.soapByLocale[uiLocale],
    auditLog: item.auditByLocale[uiLocale],
  }));
}

// ============================================================================
// 6. VERTIKAL SEMANTISK ZOOM-TIDSLINJE — UI KOMPONENTER
// ============================================================================

const CATEGORY_STYLES: Record<
  JournalEventCategory,
  { dot: string; badge: string; tick: string }
> = {
  sessions: {
    dot: "bg-teal-600 ring-teal-100",
    badge: "border-teal-200 bg-teal-50 text-teal-800",
    tick: "bg-teal-600",
  },
  goals: {
    dot: "bg-indigo-600 ring-indigo-100",
    badge: "border-indigo-200 bg-indigo-50 text-indigo-800",
    tick: "bg-indigo-600",
  },
  interventions: {
    dot: "bg-amber-500 ring-amber-100",
    badge: "border-amber-200 bg-amber-50 text-amber-900",
    tick: "bg-amber-500",
  },
  revisions: {
    dot: "bg-slate-600 ring-slate-200",
    badge: "border-slate-300 bg-slate-100 text-slate-800",
    tick: "bg-slate-600",
  },
};

const ClinicalSoapGrid: React.FC<{
  soap: ClinicalJournalEvent["soap"];
  copy: JournalCopy;
}> = ({ soap, copy }) => {
  const cells: Array<{
    key: string;
    label: string;
    text: string;
    highlight?: boolean;
  }> = [
    { key: "s", label: copy.timelineSoapS, text: soap.subjective },
    { key: "o", label: copy.timelineSoapO, text: soap.objective },
    { key: "a", label: copy.timelineSoapA, text: soap.assessment },
    { key: "p", label: copy.timelineSoapP, text: soap.plan, highlight: true },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {cells.map((cell) => (
        <div
          key={cell.key}
          className={`rounded-xl border p-3 ${
            cell.highlight
              ? "border-teal-200 bg-teal-50/70"
              : "border-slate-200 bg-slate-50/80"
          }`}
        >
          <div
            className={`text-[11px] font-bold uppercase tracking-wide ${
              cell.highlight ? "text-teal-800" : "text-slate-500"
            }`}
          >
            {cell.label}
          </div>
          <p
            className={`mt-1 mb-0 text-xs leading-relaxed ${
              cell.highlight ? "font-medium text-teal-950" : "text-slate-800"
            }`}
          >
            {cell.text}
          </p>
        </div>
      ))}
    </div>
  );
};

export interface SemanticTimelineStreamProps {
  events: ClinicalJournalEvent[];
  zoomLevel: number;
  selectedEventId: string | null;
  onSelectEvent: (event: ClinicalJournalEvent) => void;
  streamRef: React.RefObject<HTMLDivElement | null>;
  onScrollRatioChange: (ratio: number) => void;
  onWheelZoom?: (deltaZoom: number) => void;
  locale?: string;
}

export const SemanticTimelineStream: React.FC<SemanticTimelineStreamProps> = ({
  events,
  zoomLevel,
  selectedEventId,
  onSelectEvent,
  streamRef,
  onScrollRatioChange,
  onWheelZoom,
  locale,
}) => {
  const contextLocale = useUiLocale();
  const uiLocale = resolveUiLocale(locale ?? contextLocale);
  const copy = JOURNAL_COPY[uiLocale];
  const tier = resolveSemanticZoomTier(zoomLevel);

  const groupedByYear = useMemo(() => {
    const groups = new Map<string, ClinicalJournalEvent[]>();
    for (const ev of events) {
      const year = ev.date.slice(0, 4);
      const list = groups.get(year) ?? [];
      list.push(ev);
      groups.set(year, list);
    }
    return Array.from(groups.entries());
  }, [events]);

  const handleStreamScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const maxScroll = el.scrollHeight - el.clientHeight;
    onScrollRatioChange(maxScroll > 0 ? clampNumber(el.scrollTop / maxScroll, 0, 1) : 0);
  };

  const handleStreamWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && onWheelZoom) {
      e.preventDefault();
      onWheelZoom(e.deltaY < 0 ? 6 : -6);
    }
  };

  return (
    <div
      ref={streamRef}
      onScroll={handleStreamScroll}
      onWheel={handleStreamWheel}
      data-testid="semantic-timeline-stream"
      className="max-h-[620px] min-w-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
    >
      <div className="space-y-6">
        {groupedByYear.map(([year, yearEvents]) => (
          <section key={year} data-testid={`timeline-year-${year}`}>
            <div className="mb-3 flex items-center gap-3">
              <span className="rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-xs font-bold text-white">
                {year}
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <ol className="relative ml-2.5 list-none space-y-3 border-l-2 border-slate-200 pl-5">
              {yearEvents.map((event) => {
                const styles = CATEGORY_STYLES[event.lane];
                const isSelected = selectedEventId === event.id;
                const selectedRing = isSelected
                  ? "ring-2 ring-teal-600/40 border-teal-500"
                  : tier === "micro"
                    ? "border-teal-300/80"
                    : "border-slate-200";
                const cardPadding =
                  tier === "macro"
                    ? "py-2 px-3.5"
                    : tier === "meso"
                      ? "p-4"
                      : "p-5";

                return (
                  <li key={event.id} className="relative">
                    <span
                      aria-hidden="true"
                      className={`absolute -left-[27px] top-3.5 h-3 w-3 rounded-full ring-4 ${styles.dot}`}
                    />
                    <div
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      data-testid={`timeline-event-card-${event.id}`}
                      data-zoom-tier={tier}
                      onClick={() => onSelectEvent(event)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectEvent(event);
                        }
                      }}
                      className={`w-full cursor-pointer rounded-xl border bg-white text-left transition-shadow hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-600 ${cardPadding} ${selectedRing}`}
                    >
                      {tier === "macro" && (
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="shrink-0 font-mono text-xs font-semibold text-slate-500">
                              {event.date}
                            </span>
                            <span className="truncate text-sm font-medium text-slate-900">
                              {event.title}
                            </span>
                          </div>
                          {event.who5Score && (
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                              WHO-5 {event.who5Score}
                            </span>
                          )}
                        </div>
                      )}

                      {tier === "meso" && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${styles.badge}`}
                              >
                                {event.tag}
                              </span>
                              <span className="font-mono text-xs text-slate-500">
                                {event.date}
                                {event.timestamp ? ` · ${event.timestamp}` : ""}
                              </span>
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                                {event.version}
                              </span>
                            </div>
                            {event.who5Score && (
                              <span className="rounded-full bg-teal-50 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-teal-800">
                                WHO-5: {event.who5Score}
                              </span>
                            )}
                          </div>
                          <h3 className="m-0 text-sm font-bold leading-snug text-slate-900">
                            {event.title}
                          </h3>
                          <p className="m-0 line-clamp-3 text-sm leading-relaxed text-slate-600">
                            {event.summary}
                          </p>
                        </div>
                      )}

                      {tier === "micro" && (
                        <div className="space-y-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${styles.badge}`}
                              >
                                {event.tag}
                              </span>
                              <span className="font-mono text-xs font-medium text-slate-600">
                                {event.date}
                                {event.timestamp ? ` · ${event.timestamp}` : ""}
                              </span>
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                {copy.timelineSignedBadge}
                              </span>
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                                {event.version}
                              </span>
                            </div>
                            {event.who5Score && (
                              <span className="rounded-full bg-teal-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-teal-800">
                                WHO-5: {event.who5Score}
                              </span>
                            )}
                          </div>

                          <h3 className="m-0 text-base font-bold leading-snug text-slate-900">
                            {event.title}
                          </h3>

                          <ClinicalSoapGrid soap={event.soap} copy={copy} />

                          <div className="border-t border-slate-100 pt-2 font-mono text-[11px] text-slate-500">
                            {event.auditLog}
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
};

export interface VerticalZoomScrollbarProps {
  zoomLevel: number;
  scrollRatio: number;
  events: ClinicalJournalEvent[];
  onZoomChange: (zoomLevel: number) => void;
  onScrollRatioChange: (scrollRatio: number) => void;
  locale?: string;
}

export const VerticalZoomScrollbar: React.FC<VerticalZoomScrollbarProps> = ({
  zoomLevel,
  scrollRatio,
  events,
  onZoomChange,
  onScrollRatioChange,
  locale,
}) => {
  const contextLocale = useUiLocale();
  const uiLocale = resolveUiLocale(locale ?? contextLocale);
  const copy = JOURNAL_COPY[uiLocale];
  const trackRef = useRef<HTMLDivElement | null>(null);
  const cleanupDragRef = useRef<(() => void) | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { thumbHeightPct, topPct } = computeThumbMetrics(zoomLevel, scrollRatio);

  useEffect(() => {
    return () => {
      cleanupDragRef.current?.();
      cleanupDragRef.current = null;
      document.body.classList.remove("select-none");
    };
  }, []);

  const startDrag = (mode: ZoomDragMode, startClientY: number) => {
    cleanupDragRef.current?.();
    const startZoom = zoomLevel;
    const startRatio = scrollRatio;
    const trackHeight = trackRef.current?.getBoundingClientRect().height ?? 0;

    setIsDragging(true);
    document.body.classList.add("select-none");

    const applyClientY = (clientY: number) => {
      const next = computeDragUpdate({
        mode,
        dy: clientY - startClientY,
        trackHeight,
        startZoom,
        startRatio,
        currentZoom: zoomLevel,
      });
      if (mode === "scroll") {
        onScrollRatioChange(next.scrollRatio);
      } else {
        onZoomChange(next.zoomLevel);
      }
    };

    const handleMouseMove = (e: MouseEvent) => applyClientY(e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) applyClientY(e.touches[0].clientY);
    };
    const stopDrag = () => {
      cleanupDragRef.current?.();
      cleanupDragRef.current = null;
      setIsDragging(false);
      document.body.classList.remove("select-none");
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopDrag);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", stopDrag);

    cleanupDragRef.current = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopDrag);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", stopDrag);
    };
  };

  const handleTrackWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    onZoomChange(clampNumber(zoomLevel + (e.deltaY < 0 ? 6 : -6), 15, 100));
  };

  const handleSliderKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      onZoomChange(clampNumber(zoomLevel + 5, 15, 100));
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      onZoomChange(clampNumber(zoomLevel - 5, 15, 100));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      onScrollRatioChange(clampNumber(scrollRatio - 0.08, 0, 1));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onScrollRatioChange(clampNumber(scrollRatio + 0.08, 0, 1));
    }
  };

  const newestDate = events[0].date;
  const middleDate = events[Math.floor(events.length / 2)].date;
  const oldestDate = events[events.length - 1].date;

  const dragHandlersFor = (mode: ZoomDragMode) => ({
    onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      startDrag(mode, e.clientY);
    },
    onTouchStart: (e: React.TouchEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const firstTouch = e.touches[0];
      if (firstTouch) startDrag(mode, firstTouch.clientY);
    },
  });

  return (
    <aside
      data-testid="vertical-zoom-scrollbar"
      className={`w-full rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs md:sticky md:top-4 md:w-56 md:shrink-0 ${
        isDragging ? "select-none" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
        <span className="text-xs font-semibold text-slate-700">
          {copy.timelineZoomLabel}
        </span>
        <span
          data-testid="zoom-percentage-value"
          className="rounded-md bg-teal-50 px-2 py-0.5 font-mono text-xs font-bold text-teal-800"
        >
          {zoomLevel}%
        </span>
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={copy.timelineZoomAriaLabel}
        aria-valuemin={15}
        aria-valuemax={100}
        aria-valuenow={zoomLevel}
        data-testid="zoom-scrollbar-track"
        onKeyDown={handleSliderKeyDown}
        onWheel={handleTrackWheel}
        className="mt-3 flex h-44 items-stretch gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-2 focus:outline-none focus:ring-2 focus:ring-teal-600 md:h-64"
      >
        <div className="flex w-20 shrink-0 flex-col justify-between py-1 font-mono text-[10px] text-slate-500">
          <span>{newestDate}</span>
          <span>{middleDate}</span>
          <span>{oldestDate}</span>
        </div>

        <div className="relative flex-1 rounded-lg bg-slate-200/70">
          {events.map((ev, idx) => {
            const top =
              events.length > 1 ? (idx / (events.length - 1)) * 92 + 4 : 50;
            return (
              <span
                key={ev.id}
                aria-hidden="true"
                className={`pointer-events-none absolute left-1.5 right-1.5 h-1 rounded-full opacity-75 ${CATEGORY_STYLES[ev.lane].tick}`}
                style={{ top: `${top}%` }}
              />
            );
          })}

          <div
            data-testid="zoom-viewport-thumb"
            className="absolute left-0.5 right-0.5 flex flex-col justify-between overflow-hidden rounded-lg border-2 border-teal-700 bg-teal-500/20 shadow-xs"
            style={{
              height: `${thumbHeightPct}%`,
              top: `${topPct}%`,
            }}
          >
            <div
              data-testid="zoom-handle-top"
              {...dragHandlersFor("zoomTop")}
              className="flex h-3 cursor-ns-resize items-center justify-center bg-teal-700 text-white"
            >
              <span className="h-0.5 w-6 rounded-full bg-white/90" />
            </div>

            <div
              data-testid="zoom-handle-scroll"
              {...dragHandlersFor("scroll")}
              className="flex-1 cursor-grab active:cursor-grabbing"
            />

            <div
              data-testid="zoom-handle-bottom"
              {...dragHandlersFor("zoomBottom")}
              className="flex h-3 cursor-ns-resize items-center justify-center bg-teal-700 text-white"
            >
              <span className="h-0.5 w-6 rounded-full bg-white/90" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <input
          type="range"
          min={15}
          max={100}
          value={zoomLevel}
          aria-label={copy.timelineZoomAriaLabel}
          data-testid="zoom-range-slider"
          onChange={(e) =>
            onZoomChange(clampNumber(Number(e.target.value), 15, 100))
          }
          className="min-h-11 w-full cursor-pointer accent-teal-700"
        />
        <p className="m-0 font-mono text-[10px] text-slate-500">
          {copy.timelineZoomHint}
        </p>
      </div>
    </aside>
  );
};

export interface JournalDetailInspectorProps {
  event: ClinicalJournalEvent;
  onClose: () => void;
  locale?: string;
}

export const JournalDetailInspector: React.FC<JournalDetailInspectorProps> = ({
  event,
  onClose,
  locale,
}) => {
  const contextLocale = useUiLocale();
  const uiLocale = resolveUiLocale(locale ?? contextLocale);
  const copy = JOURNAL_COPY[uiLocale];
  const styles = CATEGORY_STYLES[event.lane];

  return (
    <section
      data-testid="journal-detail-inspector"
      className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-teal-800">
              {copy.timelineInspectorTitle}
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${styles.badge}`}
            >
              {event.tag}
            </span>
            <span className="font-mono text-xs text-slate-500">
              {event.date}
              {event.timestamp ? ` · ${event.timestamp}` : ""}
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
              {event.version}
            </span>
            {event.who5Score && (
              <span className="rounded-full bg-teal-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-teal-800">
                WHO-5: {event.who5Score}
              </span>
            )}
          </div>
          <h3 className="m-0 text-base font-bold text-slate-900">
            {event.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          data-testid="close-detail-inspector"
          className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          {copy.timelineInspectorClose}
        </button>
      </div>

      <p className="mt-3 mb-4 text-sm leading-relaxed text-slate-600">
        {event.summary}
      </p>

      <ClinicalSoapGrid soap={event.soap} copy={copy} />

      <div className="mt-3 border-t border-slate-100 pt-2.5 font-mono text-xs text-slate-500">
        {event.auditLog}
      </div>
    </section>
  );
};

export interface PatientTimelineContainerProps {
  locale?: string;
  initialZoomLevel?: number;
  events?: ClinicalJournalEvent[];
  initialClientId?: string;
  skipRoleGuard?: boolean;
}

const DEMO_SOURCE_ID = "demo-multiyear";

const PatientTimelineContent: React.FC<PatientTimelineContainerProps> = ({
  locale,
  initialZoomLevel = 55,
  events: providedEvents,
  initialClientId = DEMO_SOURCE_ID,
}) => {
  const contextLocale = useUiLocale();
  const uiLocale = resolveUiLocale(locale ?? contextLocale);
  const copy = JOURNAL_COPY[uiLocale];
  const auth = useOptionalAuth();

  const [zoomLevel, setZoomLevel] = useState<number>(() =>
    clampNumber(initialZoomLevel, 15, 100)
  );
  const [scrollRatio, setScrollRatio] = useState<number>(0);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<
    "all" | JournalEventCategory
  >("all");
  const [selectedSourceId, setSelectedSourceId] =
    useState<string>(initialClientId);
  const [clientOptions, setClientOptions] = useState<TimelineClientOption[]>(
    []
  );
  const [liveEvents, setLiveEvents] = useState<ClinicalJournalEvent[]>([]);
  const [loadingClientData, setLoadingClientData] = useState(false);

  const streamRef = useRef<HTMLDivElement | null>(null);
  const scrollRatioRef = useRef<number>(0);
  scrollRatioRef.current = scrollRatio;

  useEffect(() => {
    if (providedEvents) return;
    let cancelled = false;
    journalApi
      .getClinicClients(auth?.user.id, auth?.user.email)
      .then((clients) => {
        if (!cancelled) setClientOptions(clients);
      });
    return () => {
      cancelled = true;
    };
  }, [providedEvents, auth?.user.id, auth?.user.email]);

  useEffect(() => {
    if (providedEvents || selectedSourceId === DEMO_SOURCE_ID) {
      setLiveEvents([]);
      return;
    }
    let cancelled = false;
    setLoadingClientData(true);
    journalApi
      .getClientTimelineData(selectedSourceId, auth?.user.id)
      .then((bundle) => {
        if (cancelled) return;
        setLiveEvents(mapBundleToClinicalTimelineEvents(bundle, uiLocale));
      })
      .finally(() => {
        if (!cancelled) setLoadingClientData(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providedEvents, selectedSourceId, auth?.user.id, uiLocale]);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      const el = streamRef.current;
      if (!el) return;
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = scrollRatioRef.current * maxScroll;
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [zoomLevel, activeCategory, selectedSourceId]);

  const allEvents = useMemo(() => {
    if (providedEvents) {
      return [...providedEvents].sort((a, b) => b.date.localeCompare(a.date));
    }
    if (selectedSourceId === DEMO_SOURCE_ID) {
      return getReferenceClinicalTimelineEvents(uiLocale);
    }
    return liveEvents;
  }, [providedEvents, selectedSourceId, uiLocale, liveEvents]);

  const filteredEvents = useMemo(() => {
    if (activeCategory === "all") return allEvents;
    return allEvents.filter((ev) => ev.lane === activeCategory);
  }, [allEvents, activeCategory]);

  const selectedEvent = useMemo(
    () => filteredEvents.find((ev) => ev.id === selectedEventId) ?? null,
    [filteredEvents, selectedEventId]
  );

  const handleScrollbarRatioChange = useCallback((nextRatio: number) => {
    const clamped = clampNumber(nextRatio, 0, 1);
    setScrollRatio(clamped);
    const el = streamRef.current;
    if (el) {
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = clamped * maxScroll;
    }
  }, []);

  const tier = resolveSemanticZoomTier(zoomLevel);
  const tierLabel =
    tier === "macro"
      ? copy.timelineTierMacro
      : tier === "meso"
        ? copy.timelineTierMeso
        : copy.timelineTierMicro;

  const filterButtons: Array<{
    key: "all" | JournalEventCategory;
    label: string;
  }> = [
    { key: "all", label: copy.timelineFilterAll },
    { key: "sessions", label: copy.timelineFilterSessions },
    { key: "goals", label: copy.timelineFilterGoals },
    { key: "interventions", label: copy.timelineFilterInterventions },
    { key: "revisions", label: copy.timelineFilterRevisions },
  ];

  const presets: Array<{
    id: string;
    targetZoom: number;
    tier: SemanticZoomTier;
    label: string;
  }> = [
    { id: "macro", targetZoom: 25, tier: "macro", label: copy.timelinePresetMacro },
    { id: "meso", targetZoom: 55, tier: "meso", label: copy.timelinePresetMeso },
    { id: "micro", targetZoom: 88, tier: "micro", label: copy.timelinePresetMicro },
  ];

  return (
    <div className="space-y-4" data-testid="patient-timeline-container">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
              <i className="bi bi-clock-history" aria-hidden="true" />
              {copy.timelineBadge}
            </span>
            <span
              data-testid="active-zoom-tier-badge"
              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700"
            >
              {tierLabel}
            </span>
          </div>
          <h2 className="m-0 text-lg font-bold tracking-tight text-slate-900">
            {copy.timelineTitle}
          </h2>
          <p className="m-0 text-xs leading-relaxed text-slate-600">
            {copy.timelineSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!providedEvents && (
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span className="sr-only">{copy.timelineClientLabel}</span>
              <select
                aria-label={copy.timelineClientLabel}
                data-testid="timeline-client-select"
                value={selectedSourceId}
                onChange={(e) => {
                  setSelectedEventId(null);
                  setSelectedSourceId(e.target.value);
                }}
                className="min-h-11 w-64 max-w-full truncate rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-teal-600 focus:outline-none"
              >
                <option value={DEMO_SOURCE_ID}>
                  {copy.timelineDemoCaseLabel}
                </option>
                {clientOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-100 p-1">
            {presets.map((preset) => {
              const active = tier === preset.tier;
              return (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`zoom-preset-${preset.id}`}
                  onClick={() => setZoomLevel(preset.targetZoom)}
                  className={`min-h-11 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-teal-700 text-white shadow-xs"
                      : "text-slate-700 hover:bg-white"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filterButtons.map((btn) => {
          const active = activeCategory === btn.key;
          return (
            <button
              key={btn.key}
              type="button"
              data-testid={`timeline-filter-${btn.key}`}
              onClick={() => setActiveCategory(btn.key)}
              className={`min-h-11 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {btn.label}
            </button>
          );
        })}
      </div>

      {loadingClientData ? (
        <p data-testid="timeline-loading-indicator" className="text-sm text-slate-500">
          {copy.loadingText}
        </p>
      ) : filteredEvents.length === 0 ? (
        <div
          data-testid="timeline-empty-state"
          className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6"
        >
          <p className="m-0 text-sm text-slate-600">{copy.timelineEmptyTitle}</p>
          {selectedSourceId !== DEMO_SOURCE_ID && !providedEvents && (
            <button
              type="button"
              data-testid="timeline-load-demo-btn"
              onClick={() => setSelectedSourceId(DEMO_SOURCE_ID)}
              className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
            >
              {copy.timelineEmptyAction}
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <SemanticTimelineStream
            events={filteredEvents}
            zoomLevel={zoomLevel}
            selectedEventId={selectedEventId}
            onSelectEvent={(ev) =>
              setSelectedEventId((prev) => (prev === ev.id ? null : ev.id))
            }
            streamRef={streamRef}
            onScrollRatioChange={setScrollRatio}
            onWheelZoom={(delta) =>
              setZoomLevel((prev) => clampNumber(prev + delta, 15, 100))
            }
            locale={uiLocale}
          />
          <VerticalZoomScrollbar
            zoomLevel={zoomLevel}
            scrollRatio={scrollRatio}
            events={filteredEvents}
            onZoomChange={(nextZoom) =>
              setZoomLevel(clampNumber(nextZoom, 15, 100))
            }
            onScrollRatioChange={handleScrollbarRatioChange}
            locale={uiLocale}
          />
        </div>
      )}

      {selectedEvent && (
        <JournalDetailInspector
          event={selectedEvent}
          onClose={() => setSelectedEventId(null)}
          locale={uiLocale}
        />
      )}
    </div>
  );
};

export const PatientTimelineContainer: React.FC<PatientTimelineContainerProps> = (
  props
) =>
  props.skipRoleGuard ? (
    <PatientTimelineContent {...props} />
  ) : (
    <RoleGuard
      allowed={["PROVIDER"]}
      fallback={<JournalForbiddenNotice portalMode="provider" />}
    >
      <PatientTimelineContent {...props} />
    </RoleGuard>
  );

export default JournalFeatureView;
