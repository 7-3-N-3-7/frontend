"use client";

/**
 * ============================================================================
 * ARKITEKTONISK VISITKORT: ClinicPlatformFeature.tsx (Vertical Feature Slice)
 * ============================================================================
 * @Spejler: backend/src/main/java/com/platform/features/clinic/ClinicPlatformFeature.java
 *
 * FORMÅL (Til Censor, Vejleder & Nykommende Udviklere):
 * 1:1 frontend-spejl af backendens [Class: ClinicPlatformFeature]. Samler
 * klient- og behandlerprofiler, CVR-validering, klinik-onboarding og
 * rolleopdelte portal-arbejdsområder i én vertikal slice:
 *
 * ARKITEKTONISK OVERBLIK (5 TRIN):
 *   1. [Record/DTO: OrganisationDto], [Record/DTO: ClientProfileDto],
 *      [Record/DTO: ProviderProfileDto], [Record/DTO: ServiceDto] &
 *      [Record/DTO: ClientTherapistHandshakeDto]
 *   2. Klient-side Domænevalidering (#isValidDanishCvr(cvr))
 *      Kontrollerer dansk 8-cifret CVR-format før klinik-onboarding.
 *   3. [Service: ClinicPlatformApiService] (Modul-Privat — Information Hiding)
 *      Arver fra [AbstractClass: BaseApiService<ClientProfileDto, string>] og
 *      validerer `fullName` og `email` i #validateBeforeCreate(dto) via [Class: DomainGuard].
 *   4. [Hook: useBaseCrud<ClientProfileDto, string>(clinicPlatformApi)]
 *      Binder `clinicPlatformApi` til reaktiv React-tilstand.
 *   5. [Component: <ClinicPlatformFeatureView />], [Component: <ConnectedPortalWorkspaceShell />],
 *      [Component: <TherapistMultiWindowWorkspace />] & [Component: <ClientPortalWorkspace />]
 * ============================================================================
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AuthenticatedUser,
  BaseApiService,
  DomainGuard,
  ErrorCode,
  HasId,
  ProblemDetail,
  UserRole,
} from "../../core/baseDomainCore";
import {
  AuthProvider,
  ConfirmActionDialog,
  PortalArea,
  PortalSwitcherOption,
  PortalUpgradeAction,
  PortalWorkspaceNavItem,
  PortalWorkspaceShell,
  PortalWorkspaceShellProps,
  ProblemAlert,
  useBaseCrud,
  useOptionalAuth,
} from "../../core/baseUiCore";
import {
  JournalFeatureView,
  PatientTimelineContainer,
} from "../journal/JournalFeature";
import { AppointmentFeatureView } from "../appointment/AppointmentFeature";
import { BookingFeatureView } from "../booking/BookingFeature";
import { PsychotraumatologyFeatureView } from "../psychotraumatology/PsychotraumatologyFeature";
import { FinanceFeatureView } from "../finance/FinanceFeature";
import {
  LanguageSwitcher,
  SupportedUiLocale,
  resolveUiLocale,
  useI18nCache,
  useUiLocale,
} from "../i18n/I18nFeature";

// ==========================================
// 1. DTOs & DOMAIN MODELS (1:1 with ClinicPlatformFeature.java)
// ==========================================

export interface OrganisationDto extends HasId<string> {
  id?: string;
  name: string;
  cvrNumber: string;
  address?: string;
  postalCode?: string;
  phoneNumber?: string;
  iban?: string;
  currency?: string;
  contactEmail?: string;
  contactPhone?: string;
  createdAt?: string;
}

export interface ClientProfileDto extends HasId<string> {
  id?: string;
  userId?: string;
  fullName: string;
  email: string;
  phone?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  homeAddress?: string;
  postalCode?: string;
  cprOrIdentifier?: string;
  notes?: string;
  createdAt?: string;
}

export interface ProviderProfileDto extends HasId<string> {
  id?: string;
  userUuid?: string;
  userId?: string;
  organisationId?: string;
  organisation?: OrganisationDto | null;
  displayName?: string;
  fullName?: string;
  title?: string;
  specialty?: string;
  bio?: string;
  biography?: string;
  workingHoursJson?: string;
  videoMeetingUrl?: string;
  iban?: string;
  currency?: string;
  createdAt?: string;
}

export interface ServiceDto extends HasId<string> {
  id?: string;
  organisationId?: string;
  provider?: ProviderProfileDto | null;
  organisation?: OrganisationDto | null;
  name: string;
  description?: string;
  durationMinutes: number;
  price?: number;
  priceDkk?: number;
  location?: string;
  currency?: string;
  active?: boolean;
  isActive?: boolean;
}

export type HandshakeStatus = "PENDING" | "REQUESTED" | "ACTIVE" | "ACCEPTED" | "TERMINATED" | "REVOKED";

export interface ClientTherapistHandshakeDto extends HasId<string> {
  id?: string;
  clientId?: string;
  clientUuid?: string;
  therapistId?: string;
  therapistUuid?: string;
  clientName?: string;
  therapistName?: string;
  organisationName?: string;
  status: HandshakeStatus | string;
  allowedBranches?: string;
  sharedJournalAccess?: boolean;
  historyStartDate?: string | null;
  historyEndDate?: string | null;
  customRestrictions?: string | null;
  requestedAt?: string;
  respondedAt?: string;
}

export interface OnboardingRequestDto {
  organisationName: string;
  cvrNumber: string;
  fullName: string;
  title?: string;
  specialty?: string;
}

export interface HandshakeRequestDto {
  clientId: string;
  therapistId: string;
  clientName?: string;
  therapistName?: string;
  sharedJournalAccess: boolean;
}

/**
 * Validerer at et dansk CVR-nummer består af præcis 8 cifre (Erhvervsstyrelsens format).
 */
export function isValidDanishCvr(cvr: string): boolean {
  return /^\d{8}$/.test((cvr || "").trim());
}

export const CLINIC_PAGE_SIZE = 10;

const HANDSHAKE_STATUS_LABELS: Record<
  SupportedUiLocale,
  Record<string, string>
> = {
  da: {
    ACTIVE: "Aktiv",
    ACCEPTED: "Accepteret",
    REQUESTED: "Afventer godkendelse",
    PENDING: "Afventer godkendelse",
    REVOKED: "Tilbagekaldt",
    TERMINATED: "Afsluttet",
  },
  en: {
    ACTIVE: "Active",
    ACCEPTED: "Accepted",
    REQUESTED: "Pending approval",
    PENDING: "Pending approval",
    REVOKED: "Revoked",
    TERMINATED: "Terminated",
  },
  fr: {
    ACTIVE: "Actif",
    ACCEPTED: "Accepté",
    REQUESTED: "En attente",
    PENDING: "En attente",
    REVOKED: "Révoqué",
    TERMINATED: "Clôturé",
  },
  es: {
    ACTIVE: "Activo",
    ACCEPTED: "Aceptado",
    REQUESTED: "Pendiente",
    PENDING: "Pendiente",
    REVOKED: "Revocado",
    TERMINATED: "Finalizado",
  },
  de: {
    ACTIVE: "Aktiv",
    ACCEPTED: "Angenommen",
    REQUESTED: "Ausstehend",
    PENDING: "Ausstehend",
    REVOKED: "Widerrufen",
    TERMINATED: "Beendet",
  },
};

export function localizeHandshakeStatus(
  status: string | undefined,
  locale: SupportedUiLocale = "da"
): string {
  const normalized = (status || "").trim().toUpperCase();
  if (!normalized) {
    return "-";
  }
  const map = HANDSHAKE_STATUS_LABELS[locale] || HANDSHAKE_STATUS_LABELS.en;
  return map[normalized] || status!.trim();
}

const MISSING_FIELD_LABELS: Record<
  SupportedUiLocale,
  Record<string, string>
> = {
  da: {
    cvr: "CVR-nummer",
    cvrnumber: "CVR-nummer",
    iban: "Bankkonto (IBAN)",
    workinghours: "Åbningstider",
    workinghoursjson: "Åbningstider",
    organisationname: "Kliniknavn",
    displayname: "Behandlernavn",
    address: "Adresse",
    homeaddress: "Hjemmeadresse",
    postalcode: "Postnummer",
    phone: "Telefonnummer",
    phonenumber: "Telefonnummer",
    email: "E-mail",
    fullname: "Fulde navn",
    dateofbirth: "Fødselsdato",
    service: "Ydelse",
    services: "Ydelser",
  },
  en: {
    cvr: "Company registration ID",
    cvrnumber: "Company registration ID",
    iban: "Bank account (IBAN)",
    workinghours: "Opening hours",
    workinghoursjson: "Opening hours",
    organisationname: "Clinic name",
    displayname: "Therapist name",
    address: "Address",
    homeaddress: "Home address",
    postalcode: "Postal code",
    phone: "Phone number",
    phonenumber: "Phone number",
    email: "Email address",
    fullname: "Full name",
    dateofbirth: "Date of birth",
    service: "Service",
    services: "Services",
  },
  fr: {
    cvr: "Numéro d'entreprise",
    cvrnumber: "Numéro d'entreprise",
    iban: "Compte bancaire (IBAN)",
    workinghours: "Horaires d'ouverture",
    workinghoursjson: "Horaires d'ouverture",
    organisationname: "Nom du cabinet",
    displayname: "Nom du praticien",
    address: "Adresse",
    homeaddress: "Adresse postale",
    postalcode: "Code postal",
    phone: "Téléphone",
    phonenumber: "Téléphone",
    email: "Adresse e-mail",
    fullname: "Nom complet",
    dateofbirth: "Date de naissance",
    service: "Prestation",
    services: "Prestations",
  },
  es: {
    cvr: "Número de registro",
    cvrnumber: "Número de registro",
    iban: "Cuenta bancaria (IBAN)",
    workinghours: "Horario de atención",
    workinghoursjson: "Horario de atención",
    organisationname: "Nombre de la clínica",
    displayname: "Nombre del terapeuta",
    address: "Dirección",
    homeaddress: "Dirección postal",
    postalcode: "Código postal",
    phone: "Teléfono",
    phonenumber: "Teléfono",
    email: "Correo electrónico",
    fullname: "Nombre completo",
    dateofbirth: "Fecha de nacimiento",
    service: "Servicio",
    services: "Servicios",
  },
  de: {
    cvr: "Registernummer",
    cvrnumber: "Registernummer",
    iban: "Bankkonto (IBAN)",
    workinghours: "Öffnungszeiten",
    workinghoursjson: "Öffnungszeiten",
    organisationname: "Klinikname",
    displayname: "Therapeutenname",
    address: "Adresse",
    homeaddress: "Wohnadresse",
    postalcode: "Postleitzahl",
    phone: "Telefonnummer",
    phonenumber: "Telefonnummer",
    email: "E-Mail-Adresse",
    fullname: "Vollständiger Name",
    dateofbirth: "Geburtsdatum",
    service: "Leistung",
    services: "Leistungen",
  },
};

export function localizeMissingField(
  field: string,
  locale: SupportedUiLocale = "da"
): string {
  const raw = (field || "").trim();
  if (!raw) {
    return "";
  }
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map = MISSING_FIELD_LABELS[locale] || MISSING_FIELD_LABELS.en;
  return map[key] || raw;
}

export function deduplicateClinicProviders(
  providers: ReadonlyArray<ProviderProfileDto>
): ProviderProfileDto[] {
  const seenIds = new Set<string>();
  const seenNames = new Map<string, number>();
  const result: ProviderProfileDto[] = [];
  for (const provider of providers) {
    const idKey = (
      provider.userUuid ||
      provider.userId ||
      provider.id ||
      ""
    )
      .trim()
      .toLowerCase();
    const nameKey = (provider.displayName || provider.fullName || "")
      .trim()
      .toLowerCase();
    if (idKey && seenIds.has(idKey)) {
      continue;
    }
    if (nameKey && seenNames.has(nameKey)) {
      if (!idKey) {
        continue;
      }
      const existingIdx = seenNames.get(nameKey)!;
      seenIds.add(idKey);
      result[existingIdx] = {
        ...provider,
        displayName: result[existingIdx].displayName || provider.displayName,
      };
      continue;
    }
    if (idKey) seenIds.add(idKey);
    if (nameKey) seenNames.set(nameKey, result.length);
    result.push(provider);
  }
  return result;
}

export function deduplicateClinicServices(
  services: ReadonlyArray<ServiceDto>
): ServiceDto[] {
  const seen = new Set<string>();
  const result: ServiceDto[] = [];
  for (const srv of services) {
    const normalizedName = (srv.name || "").trim().toLowerCase();
    const numericPrice = srv.priceDkk ?? srv.price ?? 0;
    const key = `${normalizedName}|${srv.durationMinutes ?? ""}|${numericPrice}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(srv);
  }
  return result;
}

/**
 * Filtrerer lækkede behandler-/BDD-testprofiler og brugeren selv fra klientlister
 * samt deduplikerer på både id og normaliseret fulde navn.
 */
export function filterAndDeduplicateClinicClients(
  clients: ReadonlyArray<ClientProfileDto>,
  options?: { excludeUserId?: string | null; excludeEmail?: string | null }
): ClientProfileDto[] {
  const excludeUserId = options?.excludeUserId?.trim() || "";
  const excludeEmail = options?.excludeEmail?.trim().toLowerCase() || "";
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const result: ClientProfileDto[] = [];
  for (const client of clients) {
    const name = (client.fullName || "").trim();
    const email = (client.email || "").trim().toLowerCase();
    const idKey = (client.userId || client.id || "").trim().toLowerCase();
    const nameKey = name.toLowerCase();
    if (excludeUserId && (client.userId === excludeUserId || client.id === excludeUserId)) {
      continue;
    }
    if (excludeEmail && email === excludeEmail) {
      continue;
    }
    if (/^dr\.\s/i.test(name) || /_terapeut/i.test(name) || /_terapeut/i.test(email)) {
      continue;
    }
    if ((idKey && seenIds.has(idKey)) || (nameKey && seenNames.has(nameKey))) {
      continue;
    }
    if (idKey) seenIds.add(idKey);
    if (nameKey) seenNames.add(nameKey);
    result.push(client);
  }
  return result;
}

// ==========================================
// 2. INFRASTRUCTURE / API SERVICE (Module-Private)
// Notice: NO 'export' keyword! Strictly encapsulated.
// ==========================================

class ClinicPlatformApiService extends BaseApiService<
  ClientProfileDto,
  string
> {
  constructor() {
    super("/api/backend/clinic/clients");
  }

  /**
   * Pre-condition hook (Template Method):
   * Validerer klientens navn og e-mail på klient-siden før netværkskald til Spring Boot.
   */
  protected override validateBeforeCreate(
    dto: Partial<ClientProfileDto>
  ): void {
    DomainGuard.requireNotBlank(dto.fullName, "Client full name", "fullName");
    DomainGuard.requireNotBlank(dto.email, "Client email", "email");
    DomainGuard.check(
      dto.email!.includes("@"),
      "Client email must be a valid email address",
      ErrorCode.VALIDATION_FAILED,
      "email"
    );
  }
}

const clinicPlatformApi = new ClinicPlatformApiService();

async function requestClinicJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      Accept: "application/json, application/problem+json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const problem = (await res.json()) as ProblemDetail;
    throw problem;
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

function toProblemDetail(err: unknown): ProblemDetail {
  const maybe = err as { problem?: ProblemDetail };
  if (maybe?.problem) {
    return maybe.problem;
  }
  if (err && typeof err === "object" && "detail" in err) {
    return err as ProblemDetail;
  }
  return {
    type: "about:blank",
    title: "Client Error",
    status: 500,
    detail: err instanceof Error ? err.message : "Unexpected error",
    errorCode: ErrorCode.INTERNAL_ERROR,
    timestamp: new Date().toISOString(),
  };
}

// ==========================================
// 3. PRESENTATION / UI COMPONENT (Exported)
// ==========================================

interface ClinicInnerCopy {
  clientsBadge: string;
  clientsHeading: string;
  profilesCountSuffix: string;
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  registerClientBtn: string;
  loadingText: string;
  removeBtn: string;
  marketplaceBadge: string;
  marketplaceHeading: string;
  loadingProviders: string;
  emptyProviders: string;
  regIdLabel: string;
  requestCourseBtn: string;
  consentsBadge: string;
  consentsHeading: string;
  profileSavedBanner: string;
  profileFullNamePlaceholder: string;
  profileEmailPlaceholder: string;
  profilePhonePlaceholder: string;
  profileDobPlaceholder: string;
  profileAddressPlaceholder: string;
  profilePostalCodePlaceholder: string;
  saveProfileBtn: string;
  activeHandshakesHeading: string;
  emptyConsents: string;
  revokeConsentBtn: string;
  dataSharingBtn: string;
  historyStartLabel: string;
  historyEndLabel: string;
  hideMoodScoresLabel: string;
  saveDataSharingBtn: string;
  dataSharingSavedBanner: string;
  onboardingBadge: string;
  onboardingHeading: string;
  missingBeforePublishPrefix: string;
  onboardingSavedBanner: string;
  onboardOrgPlaceholder: string;
  onboardCvrPlaceholder: string;
  onboardDisplayNamePlaceholder: string;
  onboardIbanPlaceholder: string;
  onboardHoursPlaceholder: string;
  onboardAddressPlaceholder: string;
  onboardPostalPlaceholder: string;
  onboardPhonePlaceholder: string;
  currencyLabel: string;
  saveOnboardingBtn: string;
  servicesHeading: string;
  serviceNamePlaceholder: string;
  servicePricePlaceholder: string;
  serviceDurationPlaceholder: string;
  serviceLocationPlaceholder: string;
  addServiceBtn: string;
  serviceActiveLabel: string;
  serviceInactiveLabel: string;
  toggleServiceStatusBtn: string;
  deleteBtn: string;
  therapistHandshakesHeading: string;
  approveBtn: string;
  terminateBtn: string;
  cancelBtn: string;
  confirmRemoveClientTitle: string;
  confirmRemoveClientDesc: string;
  confirmRevokeTitle: string;
  confirmRevokeDesc: string;
  confirmDeleteServiceTitle: string;
  confirmDeleteServiceDesc: string;
  confirmTerminateTitle: string;
  confirmTerminateDesc: string;
  prevPageBtn: string;
  nextPageBtn: string;
  pageLabel: string;
  ofLabel: string;
  settingsClinicShortcutDesc: string;
  settingsOpenClinicBtn: string;
  marketplaceSearchPlaceholder: string;
  pendingHandshakeAlertTitle: string;
  pendingHandshakeAlertDesc: string;
  openClinicCvrBtn: string;
}

const CLINIC_INNER_COPY: Record<SupportedUiLocale, ClinicInnerCopy> = {
  da: {
    clientsBadge: "Klientregister",
    clientsHeading: "Klinikplatform — Klientprofiler & Samarbejdsaftaler",
    profilesCountSuffix: "profiler",
    nameLabel: "Navn",
    namePlaceholder: "Fulde navn",
    emailLabel: "E-mail",
    emailPlaceholder: "Klientens e-mail",
    phoneLabel: "Telefon",
    phonePlaceholder: "Telefon (valgfri)",
    registerClientBtn: "Registrer klient",
    loadingText: "Indlæser...",
    removeBtn: "Fjern",
    marketplaceBadge: "Klinik & Praksis Markedsplads",
    marketplaceHeading: "Find Verificerede Behandlere & Ydelser",
    loadingProviders: "Indlæser behandlere...",
    emptyProviders: "Ingen eksterne behandlere er offentliggjort endnu.",
    regIdLabel: "CVR",
    requestCourseBtn: "Anmod om behandlerforløb",
    consentsBadge: "Min Profil & Samtykker",
    consentsHeading: "Personoplysninger & Datadeling med Behandlere",
    profileSavedBanner: "Din personlige profil er gemt.",
    profileFullNamePlaceholder: "Fulde navn",
    profileEmailPlaceholder: "E-mail",
    profilePhonePlaceholder: "Telefonnummer",
    profileDobPlaceholder: "Fødselsdato (YYYY-MM-DD)",
    profileAddressPlaceholder: "Hjemmeadresse",
    profilePostalCodePlaceholder: "Postnummer",
    saveProfileBtn: "Gem personlige oplysninger",
    activeHandshakesHeading: "Aktive Behandlersamtykker",
    emptyConsents:
      "Du har ingen behandlerrelationer endnu. Find en klinik under Klinik & Praksis.",
    revokeConsentBtn: "Tilbagekald samtykke",
    dataSharingBtn: "Datadeling",
    historyStartLabel: "Del historik fra",
    historyEndLabel: "Del historik til",
    hideMoodScoresLabel: "Skjul stemnings- & symptomscorer",
    saveDataSharingBtn: "Gem datadelingsvalg",
    dataSharingSavedBanner: "Datadelingsindstillinger er opdateret.",
    onboardingBadge: "Klinik, CVR & Ydelser",
    onboardingHeading: "Klinikprofil, Registrering & Behandlersamarbejde",
    missingBeforePublishPrefix: "Mangler før ydelser kan udgives",
    onboardingSavedBanner: "Klinik- og CVR-profil er opdateret.",
    onboardOrgPlaceholder: "Kliniknavn",
    onboardCvrPlaceholder: "8-cifret CVR",
    onboardDisplayNamePlaceholder: "Behandlernavn",
    onboardIbanPlaceholder: "IBAN kontonummer",
    onboardHoursPlaceholder: "Åbningstid (09:00-17:00)",
    onboardAddressPlaceholder: "Klinikadresse",
    onboardPostalPlaceholder: "Postnummer",
    onboardPhonePlaceholder: "Kliniktelefon",
    currencyLabel: "Valuta",
    saveOnboardingBtn: "Gem CVR & Klinikprofil",
    servicesHeading: "Behandlerydelser",
    serviceNamePlaceholder: "Ydelsesnavn",
    servicePricePlaceholder: "Pris",
    serviceDurationPlaceholder: "Minutter",
    serviceLocationPlaceholder: "Lokation",
    addServiceBtn: "Tilføj ydelse",
    serviceActiveLabel: "Aktiv",
    serviceInactiveLabel: "Inaktiv",
    toggleServiceStatusBtn: "Skift status",
    deleteBtn: "Slet",
    therapistHandshakesHeading: "Klient-Samarbejdsaftaler",
    approveBtn: "Godkend",
    terminateBtn: "Afslut",
    cancelBtn: "Annuller",
    confirmRemoveClientTitle: "Fjern klientprofil",
    confirmRemoveClientDesc:
      "Er du sikker på, at du vil fjerne denne klientprofil? Handlingen kan ikke fortrydes.",
    confirmRevokeTitle: "Tilbagekald samtykke",
    confirmRevokeDesc:
      "Når samtykket tilbagekaldes, mister behandleren øjeblikkeligt adgang til delte oplysninger.",
    confirmDeleteServiceTitle: "Slet ydelse",
    confirmDeleteServiceDesc: "Vil du slette denne behandlerydelse fra klinikken?",
    confirmTerminateTitle: "Afslut samarbejde",
    confirmTerminateDesc:
      "Er du sikker på, at du vil afslutte dette behandlersamarbejde?",
    prevPageBtn: "Forrige",
    nextPageBtn: "Næste",
    pageLabel: "Side",
    ofLabel: "af",
    settingsClinicShortcutDesc:
      "Administrer CVR-nummer, IBAN, åbningstider, ydelser og klient-samarbejdsaftaler i det dedikerede praksis-arbejdsområde.",
    settingsOpenClinicBtn: "Åbn CVR & Praksis",
    marketplaceSearchPlaceholder: "Søg på behandler, klinik, CVR eller ydelse...",
    pendingHandshakeAlertTitle: "Afventende samtykkeanmodninger",
    pendingHandshakeAlertDesc: "nye klientanmodninger afventer din godkendelse.",
    openClinicCvrBtn: "Gå til godkendelse",
  },
  en: {
    clientsBadge: "Client Registry",
    clientsHeading: "Clinic Platform — Client Profiles & Agreements",
    profilesCountSuffix: "profiles",
    nameLabel: "Name",
    namePlaceholder: "Client Full Name",
    emailLabel: "Email",
    emailPlaceholder: "Client Email",
    phoneLabel: "Phone",
    phonePlaceholder: "Phone (Optional)",
    registerClientBtn: "Register Client",
    loadingText: "Loading...",
    removeBtn: "Remove",
    marketplaceBadge: "Clinic & Practice Marketplace",
    marketplaceHeading: "Find Verified Therapists & Services",
    loadingProviders: "Loading therapists...",
    emptyProviders: "No external therapists have been published yet.",
    regIdLabel: "Reg. ID",
    requestCourseBtn: "Request therapist care",
    consentsBadge: "My Profile & Consents",
    consentsHeading: "Personal Information & Therapist Data Sharing",
    profileSavedBanner: "Your personal profile has been saved.",
    profileFullNamePlaceholder: "Full name",
    profileEmailPlaceholder: "Email address",
    profilePhonePlaceholder: "Phone number",
    profileDobPlaceholder: "Date of birth (YYYY-MM-DD)",
    profileAddressPlaceholder: "Home address",
    profilePostalCodePlaceholder: "Postal code",
    saveProfileBtn: "Save personal details",
    activeHandshakesHeading: "Active Therapist Consents",
    emptyConsents:
      "You have no therapist connections yet. Find a clinic under Clinics & Practice.",
    revokeConsentBtn: "Revoke consent",
    dataSharingBtn: "Data sharing",
    historyStartLabel: "Share history from",
    historyEndLabel: "Share history until",
    hideMoodScoresLabel: "Hide mood & symptom scores",
    saveDataSharingBtn: "Save sharing preferences",
    dataSharingSavedBanner: "Data sharing preferences updated.",
    onboardingBadge: "Clinic, Registry & Services",
    onboardingHeading: "Clinic Onboarding, Registration & Agreements",
    missingBeforePublishPrefix: "Missing before services can be published",
    onboardingSavedBanner: "Clinic and company profile has been updated.",
    onboardOrgPlaceholder: "Clinic name",
    onboardCvrPlaceholder: "8-digit company ID",
    onboardDisplayNamePlaceholder: "Therapist display name",
    onboardIbanPlaceholder: "IBAN account number",
    onboardHoursPlaceholder: "Opening hours (09:00-17:00)",
    onboardAddressPlaceholder: "Clinic address",
    onboardPostalPlaceholder: "Postal code",
    onboardPhonePlaceholder: "Clinic phone",
    currencyLabel: "Currency",
    saveOnboardingBtn: "Save Registry & Clinic Profile",
    servicesHeading: "Therapist Services",
    serviceNamePlaceholder: "Service name",
    servicePricePlaceholder: "Price",
    serviceDurationPlaceholder: "Minutes",
    serviceLocationPlaceholder: "Location",
    addServiceBtn: "Add service",
    serviceActiveLabel: "Active",
    serviceInactiveLabel: "Inactive",
    toggleServiceStatusBtn: "Toggle status",
    deleteBtn: "Delete",
    therapistHandshakesHeading: "Client Agreements",
    approveBtn: "Approve",
    terminateBtn: "Terminate",
    cancelBtn: "Cancel",
    confirmRemoveClientTitle: "Remove client profile",
    confirmRemoveClientDesc:
      "Are you sure you want to remove this client profile? This action cannot be undone.",
    confirmRevokeTitle: "Revoke consent",
    confirmRevokeDesc:
      "Once revoked, the therapist immediately loses access to shared data.",
    confirmDeleteServiceTitle: "Delete service",
    confirmDeleteServiceDesc: "Do you want to remove this clinical service?",
    confirmTerminateTitle: "Terminate agreement",
    confirmTerminateDesc: "Are you sure you want to end this care agreement?",
    prevPageBtn: "Previous",
    nextPageBtn: "Next",
    pageLabel: "Page",
    ofLabel: "of",
    settingsClinicShortcutDesc:
      "Manage company registration ID, IBAN, opening hours, services, and client agreements in the dedicated practice workspace.",
    settingsOpenClinicBtn: "Open Practice & Registry",
    marketplaceSearchPlaceholder: "Search therapist, clinic, ID, or service...",
    pendingHandshakeAlertTitle: "Pending consent requests",
    pendingHandshakeAlertDesc: "new client requests awaiting your approval.",
    openClinicCvrBtn: "Review requests",
  },
  fr: {
    clientsBadge: "Registre des Clients",
    clientsHeading: "Plateforme Clinique — Profils Clients & Accords",
    profilesCountSuffix: "profils",
    nameLabel: "Nom",
    namePlaceholder: "Nom complet du client",
    emailLabel: "E-mail",
    emailPlaceholder: "E-mail du client",
    phoneLabel: "Téléphone",
    phonePlaceholder: "Téléphone (optionnel)",
    registerClientBtn: "Enregistrer le client",
    loadingText: "Chargement...",
    removeBtn: "Supprimer",
    marketplaceBadge: "Place de Marché Clinique",
    marketplaceHeading: "Trouver des Praticiens Vérifiés & Prestations",
    loadingProviders: "Chargement des praticiens...",
    emptyProviders: "Aucun praticien externe n'est encore publié.",
    regIdLabel: "N° Reg.",
    requestCourseBtn: "Demander un suivi",
    consentsBadge: "Mon Profil & Consentements",
    consentsHeading: "Données Personnelles & Partage avec les Praticiens",
    profileSavedBanner: "Votre profil personnel a été enregistré.",
    profileFullNamePlaceholder: "Nom complet",
    profileEmailPlaceholder: "Adresse e-mail",
    profilePhonePlaceholder: "Numéro de téléphone",
    profileDobPlaceholder: "Date de naissance (AAAA-MM-JJ)",
    profileAddressPlaceholder: "Adresse postale",
    profilePostalCodePlaceholder: "Code postal",
    saveProfileBtn: "Enregistrer les informations",
    activeHandshakesHeading: "Consentements Praticiens Actifs",
    emptyConsents:
      "Vous n'avez aucune relation praticien pour le moment. Trouvez un cabinet dans Cliniques & Cabinets.",
    revokeConsentBtn: "Révoquer le consentement",
    dataSharingBtn: "Partage",
    historyStartLabel: "Partager l'historique dès",
    historyEndLabel: "Partager l'historique jusqu'au",
    hideMoodScoresLabel: "Masquer les scores d'humeur",
    saveDataSharingBtn: "Enregistrer le partage",
    dataSharingSavedBanner: "Préférences de partage mises à jour.",
    onboardingBadge: "Clinique, Registre & Prestations",
    onboardingHeading: "Inscription Clinique, Registre & Accords Clients",
    missingBeforePublishPrefix: "Manquant avant publication des prestations",
    onboardingSavedBanner: "Le profil clinique et de registre est à jour.",
    onboardOrgPlaceholder: "Nom de la clinique",
    onboardCvrPlaceholder: "N° d'entreprise (8 chiffres)",
    onboardDisplayNamePlaceholder: "Nom du praticien",
    onboardIbanPlaceholder: "Compte IBAN",
    onboardHoursPlaceholder: "Horaires (09:00-17:00)",
    onboardAddressPlaceholder: "Adresse de la clinique",
    onboardPostalPlaceholder: "Code postal",
    onboardPhonePlaceholder: "Téléphone clinique",
    currencyLabel: "Devise",
    saveOnboardingBtn: "Enregistrer le profil clinique",
    servicesHeading: "Prestations du Praticien",
    serviceNamePlaceholder: "Nom de la prestation",
    servicePricePlaceholder: "Tarif",
    serviceDurationPlaceholder: "Minutes",
    serviceLocationPlaceholder: "Lieu",
    addServiceBtn: "Ajouter une prestation",
    serviceActiveLabel: "Actif",
    serviceInactiveLabel: "Inactif",
    toggleServiceStatusBtn: "Changer le statut",
    deleteBtn: "Supprimer",
    therapistHandshakesHeading: "Accords Clients",
    approveBtn: "Approuver",
    terminateBtn: "Clôturer",
    cancelBtn: "Annuler",
    confirmRemoveClientTitle: "Supprimer le profil client",
    confirmRemoveClientDesc:
      "Voulez-vous vraiment supprimer ce profil client ? Cette action est irréversible.",
    confirmRevokeTitle: "Révoquer le consentement",
    confirmRevokeDesc:
      "Une fois révoqué, le praticien n'a plus accès aux données partagées.",
    confirmDeleteServiceTitle: "Supprimer la prestation",
    confirmDeleteServiceDesc: "Voulez-vous supprimer cette prestation clinique ?",
    confirmTerminateTitle: "Clôturer l'accord",
    confirmTerminateDesc: "Voulez-vous vraiment clôturer cet accord de suivi ?",
    prevPageBtn: "Précédent",
    nextPageBtn: "Suivant",
    pageLabel: "Page",
    ofLabel: "sur",
    settingsClinicShortcutDesc:
      "Gérez le numéro d'entreprise, l'IBAN, les horaires, les prestations et les accords clients dans l'espace dédié au cabinet.",
    settingsOpenClinicBtn: "Ouvrir Cabinet & Registre",
    marketplaceSearchPlaceholder: "Rechercher praticien, clinique ou soin...",
    pendingHandshakeAlertTitle: "Demandes de consentement en attente",
    pendingHandshakeAlertDesc: "nouvelles demandes clients à approuver.",
    openClinicCvrBtn: "Examiner les demandes",
  },
  es: {
    clientsBadge: "Registro de Clientes",
    clientsHeading: "Plataforma Clínica — Perfiles de Clientes y Acuerdos",
    profilesCountSuffix: "perfiles",
    nameLabel: "Nombre",
    namePlaceholder: "Nombre completo del cliente",
    emailLabel: "Correo electrónico",
    emailPlaceholder: "Correo del cliente",
    phoneLabel: "Teléfono",
    phonePlaceholder: "Teléfono (opcional)",
    registerClientBtn: "Registrar cliente",
    loadingText: "Cargando...",
    removeBtn: "Eliminar",
    marketplaceBadge: "Mercado de Clínicas y Práctica",
    marketplaceHeading: "Encuentra Terapeutas Verificados y Servicios",
    loadingProviders: "Cargando terapeutas...",
    emptyProviders: "Aún no hay terapeutas externos publicados.",
    regIdLabel: "N.º Reg.",
    requestCourseBtn: "Solicitar seguimiento clínico",
    consentsBadge: "Mi Perfil y Consentimientos",
    consentsHeading: "Datos Personales y Compartición con Terapeutas",
    profileSavedBanner: "Tu perfil personal ha sido guardado.",
    profileFullNamePlaceholder: "Nombre completo",
    profileEmailPlaceholder: "Correo electrónico",
    profilePhonePlaceholder: "Número de teléfono",
    profileDobPlaceholder: "Fecha de nacimiento (AAAA-MM-DD)",
    profileAddressPlaceholder: "Dirección postal",
    profilePostalCodePlaceholder: "Código postal",
    saveProfileBtn: "Guardar datos personales",
    activeHandshakesHeading: "Consentimientos Activos con Terapeutas",
    emptyConsents:
      "Aún no tienes relaciones con terapeutas. Encuentra una clínica en Clínicas & Práctica.",
    revokeConsentBtn: "Revocar consentimiento",
    dataSharingBtn: "Compartición",
    historyStartLabel: "Compartir historial desde",
    historyEndLabel: "Compartir historial hasta",
    hideMoodScoresLabel: "Ocultar puntuaciones de ánimo",
    saveDataSharingBtn: "Guardar preferencias",
    dataSharingSavedBanner: "Preferencias de compartición actualizadas.",
    onboardingBadge: "Clínica, Registro y Servicios",
    onboardingHeading: "Alta de Clínica, Registro y Acuerdos de Clientes",
    missingBeforePublishPrefix: "Falta antes de poder publicar servicios",
    onboardingSavedBanner: "El perfil de clínica y registro ha sido actualizado.",
    onboardOrgPlaceholder: "Nombre de la clínica",
    onboardCvrPlaceholder: "NIF / Registro (8 dígitos)",
    onboardDisplayNamePlaceholder: "Nombre del terapeuta",
    onboardIbanPlaceholder: "Cuenta bancaria IBAN",
    onboardHoursPlaceholder: "Horario (09:00-17:00)",
    onboardAddressPlaceholder: "Dirección de la clínica",
    onboardPostalPlaceholder: "Código postal",
    onboardPhonePlaceholder: "Teléfono de la clínica",
    currencyLabel: "Moneda",
    saveOnboardingBtn: "Guardar registro y perfil clínico",
    servicesHeading: "Servicios del Terapeuta",
    serviceNamePlaceholder: "Nombre del servicio",
    servicePricePlaceholder: "Precio",
    serviceDurationPlaceholder: "Minutos",
    serviceLocationPlaceholder: "Ubicación",
    addServiceBtn: "Añadir servicio",
    serviceActiveLabel: "Activo",
    serviceInactiveLabel: "Inactivo",
    toggleServiceStatusBtn: "Cambiar estado",
    deleteBtn: "Eliminar",
    therapistHandshakesHeading: "Acuerdos con Clientes",
    approveBtn: "Aprobar",
    terminateBtn: "Finalizar",
    cancelBtn: "Cancelar",
    confirmRemoveClientTitle: "Eliminar perfil de cliente",
    confirmRemoveClientDesc:
      "¿Estás seguro de que quieres eliminar este perfil de cliente? Esta acción no se puede deshacer.",
    confirmRevokeTitle: "Revocar consentimiento",
    confirmRevokeDesc:
      "Al revocarlo, el terapeuta perderá de inmediato el acceso a los datos compartidos.",
    confirmDeleteServiceTitle: "Eliminar servicio",
    confirmDeleteServiceDesc: "¿Deseas eliminar este servicio de la clínica?",
    confirmTerminateTitle: "Finalizar acuerdo",
    confirmTerminateDesc: "¿Estás seguro de que deseas finalizar este acuerdo?",
    prevPageBtn: "Anterior",
    nextPageBtn: "Siguiente",
    pageLabel: "Página",
    ofLabel: "de",
    settingsClinicShortcutDesc:
      "Administra el NIF/registro, IBAN, horarios, servicios y acuerdos con clientes en el espacio dedicado de la clínica.",
    settingsOpenClinicBtn: "Abrir Clínica y Registro",
    marketplaceSearchPlaceholder: "Buscar terapeuta, clínica o servicio...",
    pendingHandshakeAlertTitle: "Solicitudes de consentimiento pendientes",
    pendingHandshakeAlertDesc: "nuevas solicitudes de clientes pendientes de aprobación.",
    openClinicCvrBtn: "Revisar solicitudes",
  },
  de: {
    clientsBadge: "Klientenregister",
    clientsHeading: "Klinikplattform — Klientenprofile & Freigaben",
    profilesCountSuffix: "Profile",
    nameLabel: "Name",
    namePlaceholder: "Vollständiger Klientenname",
    emailLabel: "E-Mail",
    emailPlaceholder: "Klienten-E-Mail",
    phoneLabel: "Telefon",
    phonePlaceholder: "Telefon (optional)",
    registerClientBtn: "Klient registrieren",
    loadingText: "Wird geladen...",
    removeBtn: "Entfernen",
    marketplaceBadge: "Klinik- & Praxis-Marktplatz",
    marketplaceHeading: "Verifizierte Therapeuten & Leistungen finden",
    loadingProviders: "Lade Therapeuten...",
    emptyProviders: "Es sind noch keine externen Therapeuten veröffentlicht.",
    regIdLabel: "Reg.-Nr.",
    requestCourseBtn: "Therapiebegleitung anfragen",
    consentsBadge: "Mein Profil & Einwilligungen",
    consentsHeading: "Persönliche Daten & Datenfreigabe für Therapeuten",
    profileSavedBanner: "Ihr persönliches Profil wurde gespeichert.",
    profileFullNamePlaceholder: "Vollständiger Name",
    profileEmailPlaceholder: "E-Mail-Adresse",
    profilePhonePlaceholder: "Telefonnummer",
    profileDobPlaceholder: "Geburtsdatum (JJJJ-MM-TT)",
    profileAddressPlaceholder: "Wohnadresse",
    profilePostalCodePlaceholder: "Postleitzahl",
    saveProfileBtn: "Persönliche Daten speichern",
    activeHandshakesHeading: "Aktive Therapeuten-Einwilligungen",
    emptyConsents:
      "Sie haben noch keine Therapeutenbeziehungen. Finden Sie eine Praxis unter Klinik & Praxis.",
    revokeConsentBtn: "Einwilligung widerrufen",
    dataSharingBtn: "Datenfreigabe",
    historyStartLabel: "Verlauf teilen ab",
    historyEndLabel: "Verlauf teilen bis",
    hideMoodScoresLabel: "Stimmungs- & Symptomwerte verbergen",
    saveDataSharingBtn: "Freigabe speichern",
    dataSharingSavedBanner: "Datenfreigabe-Einstellungen aktualisiert.",
    onboardingBadge: "Klinik, Register & Leistungen",
    onboardingHeading: "Klinik-Onboarding, Register & Klientenfreigaben",
    missingBeforePublishPrefix: "Fehlt vor Veröffentlichung von Leistungen",
    onboardingSavedBanner: "Klinik- und Registerprofil wurde aktualisiert.",
    onboardOrgPlaceholder: "Klinikname",
    onboardCvrPlaceholder: "8-stellige Registernummer",
    onboardDisplayNamePlaceholder: "Therapeutenname",
    onboardIbanPlaceholder: "IBAN-Kontonummer",
    onboardHoursPlaceholder: "Öffnungszeiten (09:00-17:00)",
    onboardAddressPlaceholder: "Klinikadresse",
    onboardPostalPlaceholder: "Postleitzahl",
    onboardPhonePlaceholder: "Kliniktelefon",
    currencyLabel: "Währung",
    saveOnboardingBtn: "Register & Klinikprofil speichern",
    servicesHeading: "Therapeutenleistungen",
    serviceNamePlaceholder: "Leistungsname",
    servicePricePlaceholder: "Preis",
    serviceDurationPlaceholder: "Minuten",
    serviceLocationPlaceholder: "Standort",
    addServiceBtn: "Leistung hinzufügen",
    serviceActiveLabel: "Aktiv",
    serviceInactiveLabel: "Inaktiv",
    toggleServiceStatusBtn: "Status wechseln",
    deleteBtn: "Löschen",
    therapistHandshakesHeading: "Klienten-Freigaben",
    approveBtn: "Genehmigen",
    terminateBtn: "Beenden",
    cancelBtn: "Abbrechen",
    confirmRemoveClientTitle: "Klientenprofil entfernen",
    confirmRemoveClientDesc:
      "Möchten Sie dieses Klientenprofil wirklich entfernen? Dies kann nicht rückgängig gemacht werden.",
    confirmRevokeTitle: "Einwilligung widerrufen",
    confirmRevokeDesc:
      "Nach dem Widerruf verliert der Therapeut sofort den Zugriff auf freigegebene Daten.",
    confirmDeleteServiceTitle: "Leistung löschen",
    confirmDeleteServiceDesc: "Möchten Sie diese Klinikleistung löschen?",
    confirmTerminateTitle: "Freigabe beenden",
    confirmTerminateDesc:
      "Möchten Sie diese Therapievereinbarung wirklich beenden?",
    prevPageBtn: "Zurück",
    nextPageBtn: "Weiter",
    pageLabel: "Seite",
    ofLabel: "von",
    settingsClinicShortcutDesc:
      "Verwalten Sie Registernummer, IBAN, Öffnungszeiten, Leistungen und Klientenfreigaben im eigenen Praxisbereich.",
    settingsOpenClinicBtn: "Praxis & Register öffnen",
    marketplaceSearchPlaceholder: "Therapeut, Praxis oder Leistung suchen...",
    pendingHandshakeAlertTitle: "Offene Einwilligungsanfragen",
    pendingHandshakeAlertDesc: "neue Klientenanfragen warten auf Ihre Freigabe.",
    openClinicCvrBtn: "Anfragen prüfen",
  },
};

export const ClinicPlatformFeatureView: React.FC = () => {
  const { items, loading, error, create, remove, clearError } =
    useBaseCrud(clinicPlatformApi);
  const auth = useOptionalAuth();
  const locale = useUiLocale();
  const copy = CLINIC_INNER_COPY[locale];
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [page, setPage] = useState(1);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const filteredItems = useMemo(
    () =>
      filterAndDeduplicateClinicClients(items, {
        excludeUserId: auth?.user.id,
        excludeEmail: auth?.user.email,
      }),
    [items, auth?.user.id, auth?.user.email]
  );

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / CLINIC_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleItems = filteredItems.slice(
    (safePage - 1) * CLINIC_PAGE_SIZE,
    safePage * CLINIC_PAGE_SIZE
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await create({
      fullName,
      email,
      phone: phone || undefined,
    });
    if (created) {
      setFullName("");
      setEmail("");
      setPhone("");
    }
  };

  return (
    <div
      className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5"
      data-testid="clinic-platform-feature-view"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 border border-teal-200 px-3 py-1 text-xs font-semibold text-teal-800 mb-1.5">
            <i className="bi bi-people-fill" aria-hidden="true" />
            {copy.clientsBadge}
          </span>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            {copy.clientsHeading}
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
          {filteredItems.length} {copy.profilesCountSuffix}
        </span>
      </div>

      <ProblemAlert error={error} onDismiss={clearError} />

      <form
        noValidate
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="clinic-client-fullName"
            className="text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {copy.nameLabel}
          </label>
          <input
            id="clinic-client-fullName"
            type="text"
            placeholder={copy.namePlaceholder}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            data-testid="input-client-fullName"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="clinic-client-email"
            className="text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {copy.emailLabel}
          </label>
          <input
            id="clinic-client-email"
            type="email"
            placeholder={copy.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            data-testid="input-client-email"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="clinic-client-phone"
            className="text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {copy.phoneLabel}
          </label>
          <input
            id="clinic-client-phone"
            type="text"
            placeholder={copy.phonePlaceholder}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            data-testid="input-client-phone"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
          data-testid="submit-clinic-client"
        >
          <i className="bi bi-person-plus" aria-hidden="true" />
          {copy.registerClientBtn}
        </button>
      </form>

      {loading && (
        <p
          className="text-sm text-slate-500 flex items-center gap-2"
          data-testid="loading-indicator"
        >
          <i className="bi bi-hourglass-split animate-pulse" aria-hidden="true" />
          {copy.loadingText}
        </p>
      )}

      <ul className="space-y-2.5" data-testid="clinic-client-list">
        {visibleItems.map((item) => (
          <li
            key={item.id}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm flex flex-wrap justify-between items-center gap-3 hover:border-teal-200 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-full bg-teal-50 border border-teal-200 text-teal-800 font-semibold text-sm flex items-center justify-center shrink-0">
                {(item.fullName || "?").trim().charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  <strong>{item.fullName}</strong>{" "}
                  <span className="font-normal text-slate-500">({item.email})</span>
                </div>
                {item.phone && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                    <i className="bi bi-telephone" aria-hidden="true" />
                    {item.phone}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => item.id && setPendingDeleteId(item.id)}
              className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 px-3.5 py-2 text-xs font-semibold transition-colors"
              data-testid={`delete-clinic-client-${item.id}`}
            >
              <i className="bi bi-trash3" aria-hidden="true" />
              {copy.removeBtn}
            </button>
          </li>
        ))}
      </ul>

      {filteredItems.length > CLINIC_PAGE_SIZE && (
        <div
          className="flex items-center justify-between gap-2 pt-2"
          data-testid="clinic-clients-pagination"
        >
          <button
            type="button"
            disabled={safePage <= 1}
            data-testid="clinic-clients-prev"
            onClick={() => setPage(Math.max(1, safePage - 1))}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            {copy.prevPageBtn}
          </button>
          <span className="text-xs font-medium text-slate-600">
            {copy.pageLabel} {safePage} {copy.ofLabel} {totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages}
            data-testid="clinic-clients-next"
            onClick={() => setPage(Math.min(totalPages, safePage + 1))}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            {copy.nextPageBtn}
          </button>
        </div>
      )}

      <ConfirmActionDialog
        open={Boolean(pendingDeleteId)}
        title={copy.confirmRemoveClientTitle}
        description={copy.confirmRemoveClientDesc}
        confirmLabel={copy.removeBtn}
        cancelLabel={copy.cancelBtn}
        tone="danger"
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          const id = pendingDeleteId;
          setPendingDeleteId(null);
          if (id) {
            void remove(id);
          }
        }}
      />
    </div>
  );
};

// ==========================================
// 4. PORTAL WORKSPACE WRAPPERS (Next.js App Router Integration)
// ==========================================

export interface MeUserContext {
  userUuid?: string;
  username?: string;
  fullName?: string;
  email?: string;
  roles?: string[];
  isTherapist?: boolean;
  isAdmin?: boolean;
  clientProfile?: ClientProfileDto | null;
  providerProfile?: ProviderProfileDto | null;
  canCreateServices?: boolean;
  missingProfileFields?: string[];
}

export interface ResolvePortalShellInput {
  locale: string;
  pathname: string;
  tab?: string | null;
  me: MeUserContext | null;
}

interface PortalLocaleCopy {
  portalClient: string;
  portalTherapist: string;
  portalAdmin: string;
  adminBrandSubtitle: string;
  therapistBrandSubtitle: string;
  clientBrandSubtitle: string;
  workspaceSwitcherLabel: string;
  featuresHeaderLabel: string;
  accountHeaderLabel: string;
  settingsLabel: string;
  logoutLabel: string;
  defaultUser: string;
  defaultTherapist: string;
  defaultClient: string;
  adminTitle: string;
  adminRoleLabel: string;
  adminNavI18n: string;
  adminNavUsers: string;
  adminNavManagement: string;
  adminNavClinic: string;
  therapistClinicTitle: string;
  therapistWorkspaceTitle: string;
  therapistRoleLabel: string;
  therapistNavOverview: string;
  therapistNavTimeline: string;
  therapistNavCalendar: string;
  therapistNavClinicCvr: string;
  therapistNavPcl5: string;
  therapistNavFinance: string;
  therapistTabOverview: string;
  therapistOpenTimelineCta: string;
  therapistSubtitle: string;
  clientSettingsTitle: string;
  clientClinicTitle: string;
  clientPortalTitle: string;
  clientRoleLabel: string;
  clientNavOverview: string;
  clientNavAppointments: string;
  clientNavJournal: string;
  clientNavMarketplace: string;
  clientNavConsents: string;
  clientNavPcl5: string;
  clientNavFinance: string;
  clientSecureBadge: string;
  clientDefaultSecure: string;
  clientGreetingPrefix: string;
  clientSecurityCheckPrefix: string;
  clientBookSessionCta: string;
  clientFindTherapistBtn: string;
  clientCardAppointmentsTitle: string;
  clientCardAppointmentsDesc: string;
  clientCardJournalTitle: string;
  clientCardJournalDesc: string;
  clientCardConsentsTitle: string;
  clientCardConsentsDesc: string;
  clientCardPcl5Title: string;
  clientCardPcl5Desc: string;
  upgradeLabel: string;
  upgradeDescription: string;
  missingPrefix: string;
  verifiedTherapist: string;
  systemAdmin: string;
}

const PORTAL_COPY_BY_LOCALE: Record<SupportedUiLocale, PortalLocaleCopy> = {
  da: {
    portalClient: "Klientportal",
    portalTherapist: "Behandlerportal",
    portalAdmin: "Admin",
    adminBrandSubtitle: "Admin & Ledelsesportal",
    therapistBrandSubtitle: "Klinisk Behandler-Workspace",
    clientBrandSubtitle: "Personlig Klientportal",
    workspaceSwitcherLabel: "Skift arbejdsområde",
    featuresHeaderLabel: "Funktioner",
    accountHeaderLabel: "Konto",
    settingsLabel: "Indstillinger",
    logoutLabel: "Log ud",
    defaultUser: "Bruger",
    defaultTherapist: "Behandler",
    defaultClient: "Klient",
    adminTitle: "System & Sprogadministration",
    adminRoleLabel: "Administrator",
    adminNavI18n: "Sprog & Oversættelser",
    adminNavUsers: "Brugere & Roller",
    adminNavManagement: "KPI & Ledelse",
    adminNavClinic: "Klinik & CVR",
    therapistClinicTitle: "Klinik & CVR-Administration",
    therapistWorkspaceTitle: "Behandler-Workspace",
    therapistRoleLabel: "Behandler",
    therapistNavOverview: "Overblik",
    therapistNavTimeline: "Patienttidslinje",
    therapistNavCalendar: "Kalender",
    therapistNavClinicCvr: "CVR & Praksis",
    therapistNavPcl5: "PCL-5 Screener",
    therapistNavFinance: "Økonomi & Faktura",
    therapistTabOverview: "Klinik & Journal",
    therapistOpenTimelineCta: "Åbn semantisk journal-tidslinje",
    therapistSubtitle:
      "Samlet overblik over klienter, journalnotater, aftalekalender og praksisdrift",
    clientSettingsTitle: "Profil- & Klinikindstillinger",
    clientClinicTitle: "Bliv Behandler — CVR Onboarding",
    clientPortalTitle: "Min Klientportal",
    clientRoleLabel: "Klient",
    clientNavOverview: "Overblik",
    clientNavAppointments: "Aftaler",
    clientNavJournal: "Min Dagbog",
    clientNavMarketplace: "Klinik & Praksis",
    clientNavConsents: "Samtykke & Profil",
    clientNavPcl5: "PCL-5 Test",
    clientNavFinance: "Faktura & Betaling",
    clientSecureBadge: "Sikker Klientportal",
    clientDefaultSecure: "Krypteret klinisk forbindelse aktiv",
    clientGreetingPrefix: "Velkommen",
    clientSecurityCheckPrefix: "Sikkerhedstjek",
    clientBookSessionCta: "Book ny session",
    clientFindTherapistBtn: "Find ny behandler",
    clientCardAppointmentsTitle: "Mine Aftaler",
    clientCardAppointmentsDesc: "Se kommende sessioner eller book en ny tid",
    clientCardJournalTitle: "Min Dagbog",
    clientCardJournalDesc: "Skriv personlige refleksioner og styr deling med din behandler",
    clientCardConsentsTitle: "Samtykke & Profil",
    clientCardConsentsDesc: "Administrer din profil og datadeling",
    clientCardPcl5Title: "PCL-5 Screening",
    clientCardPcl5Desc: "Udfyld og følg dine kliniske besvarelser",
    upgradeLabel: "Bliv behandler",
    upgradeDescription: "Opret klinikprofil med CVR",
    missingPrefix: "Mangler",
    verifiedTherapist: "Verificeret behandler",
    systemAdmin: "Systemadministrator",
  },
  en: {
    portalClient: "Client Portal",
    portalTherapist: "Therapist Portal",
    portalAdmin: "Admin",
    adminBrandSubtitle: "Admin & Governance Portal",
    therapistBrandSubtitle: "Clinical Therapist Workspace",
    clientBrandSubtitle: "Personal Client Portal",
    workspaceSwitcherLabel: "Switch Workspace",
    featuresHeaderLabel: "Features",
    accountHeaderLabel: "Account",
    settingsLabel: "Settings",
    logoutLabel: "Sign Out",
    defaultUser: "User",
    defaultTherapist: "Therapist",
    defaultClient: "Client",
    adminTitle: "System & Language Administration",
    adminRoleLabel: "Administrator",
    adminNavI18n: "Languages & Translations",
    adminNavUsers: "Users & Roles",
    adminNavManagement: "KPI & Management",
    adminNavClinic: "Clinic & Company",
    therapistClinicTitle: "Clinic & Company Administration",
    therapistWorkspaceTitle: "Therapist Workspace",
    therapistRoleLabel: "Therapist",
    therapistNavOverview: "Overview",
    therapistNavTimeline: "Patient Timeline",
    therapistNavCalendar: "Calendar",
    therapistNavClinicCvr: "Clinic & Registry",
    therapistNavPcl5: "PCL-5 Screener",
    therapistNavFinance: "Finance & Invoices",
    therapistTabOverview: "Clinic & Journal",
    therapistOpenTimelineCta: "Open semantic journal timeline",
    therapistSubtitle:
      "Clinical overview of clients, session notes, appointments, and practice operations",
    clientSettingsTitle: "Profile & Clinic Settings",
    clientClinicTitle: "Become a Therapist — Clinic Onboarding",
    clientPortalTitle: "My Client Portal",
    clientRoleLabel: "Client",
    clientNavOverview: "Overview",
    clientNavAppointments: "Appointments",
    clientNavJournal: "My Journal",
    clientNavMarketplace: "Clinics & Practice",
    clientNavConsents: "Consents & Profile",
    clientNavPcl5: "PCL-5 Assessment",
    clientNavFinance: "Billing & Invoices",
    clientSecureBadge: "Secure Client Portal",
    clientDefaultSecure: "Encrypted clinical connection active",
    clientGreetingPrefix: "Welcome",
    clientSecurityCheckPrefix: "Security check",
    clientBookSessionCta: "Book new session",
    clientFindTherapistBtn: "Find a therapist",
    clientCardAppointmentsTitle: "My Appointments",
    clientCardAppointmentsDesc: "View upcoming sessions or book a new slot",
    clientCardJournalTitle: "My Journal",
    clientCardJournalDesc: "Write personal reflections and manage sharing with your therapist",
    clientCardConsentsTitle: "Consents & Profile",
    clientCardConsentsDesc: "Manage your profile and data sharing",
    clientCardPcl5Title: "PCL-5 Screening",
    clientCardPcl5Desc: "Complete and track your clinical assessments",
    upgradeLabel: "Become a therapist",
    upgradeDescription: "Create clinic profile with registration ID",
    missingPrefix: "Missing",
    verifiedTherapist: "Verified Therapist",
    systemAdmin: "System Administrator",
  },
  fr: {
    portalClient: "Portail Client",
    portalTherapist: "Portail Praticien",
    portalAdmin: "Administration",
    adminBrandSubtitle: "Portail Admin & Gouvernance",
    therapistBrandSubtitle: "Espace Clinique Praticien",
    clientBrandSubtitle: "Portail Client Personnel",
    workspaceSwitcherLabel: "Changer d'espace",
    featuresHeaderLabel: "Fonctionnalités",
    accountHeaderLabel: "Compte",
    settingsLabel: "Paramètres",
    logoutLabel: "Déconnexion",
    defaultUser: "Utilisateur",
    defaultTherapist: "Praticien",
    defaultClient: "Client",
    adminTitle: "Administration Système & Langues",
    adminRoleLabel: "Administrateur",
    adminNavI18n: "Langues & Traductions",
    adminNavUsers: "Utilisateurs & Rôles",
    adminNavManagement: "KPI & Gestion",
    adminNavClinic: "Clinique & Registre",
    therapistClinicTitle: "Administration Clinique & Registre",
    therapistWorkspaceTitle: "Espace Praticien",
    therapistRoleLabel: "Praticien",
    therapistNavOverview: "Aperçu",
    therapistNavTimeline: "Chronologie Patient",
    therapistNavCalendar: "Calendrier",
    therapistNavClinicCvr: "Clinique & Registre",
    therapistNavPcl5: "Dépistage PCL-5",
    therapistNavFinance: "Finances & Factures",
    therapistTabOverview: "Clinique & Dossier",
    therapistOpenTimelineCta: "Ouvrir la chronologie clinique",
    therapistSubtitle:
      "Vue d'ensemble des clients, dossiers cliniques, rendez-vous et gestion de cabinet",
    clientSettingsTitle: "Paramètres Profil & Clinique",
    clientClinicTitle: "Devenir Praticien — Inscription Clinique",
    clientPortalTitle: "Mon Portail Client",
    clientRoleLabel: "Client",
    clientNavOverview: "Aperçu",
    clientNavAppointments: "Rendez-vous",
    clientNavJournal: "Mon Journal",
    clientNavMarketplace: "Cliniques & Cabinets",
    clientNavConsents: "Consentements & Profil",
    clientNavPcl5: "Test PCL-5",
    clientNavFinance: "Facturation & Paiements",
    clientSecureBadge: "Portail Client Sécurisé",
    clientDefaultSecure: "Connexion clinique chiffrée active",
    clientGreetingPrefix: "Bienvenue",
    clientSecurityCheckPrefix: "Contrôle sécurité",
    clientBookSessionCta: "Réserver une séance",
    clientFindTherapistBtn: "Trouver un praticien",
    clientCardAppointmentsTitle: "Mes Rendez-vous",
    clientCardAppointmentsDesc: "Consulter les séances à venir ou réserver",
    clientCardJournalTitle: "Mon Journal",
    clientCardJournalDesc: "Notez vos réflexions et gérez le partage avec votre praticien",
    clientCardConsentsTitle: "Consentements & Profil",
    clientCardConsentsDesc: "Gérer votre profil et le partage de données",
    clientCardPcl5Title: "Dépistage PCL-5",
    clientCardPcl5Desc: "Compléter et suivre vos évaluations cliniques",
    upgradeLabel: "Devenir praticien",
    upgradeDescription: "Créer un profil clinique officiel",
    missingPrefix: "Manquant",
    verifiedTherapist: "Praticien vérifié",
    systemAdmin: "Administrateur système",
  },
  es: {
    portalClient: "Portal de Cliente",
    portalTherapist: "Portal de Terapeuta",
    portalAdmin: "Administración",
    adminBrandSubtitle: "Portal de Administración y Gestión",
    therapistBrandSubtitle: "Espacio Clínico del Terapeuta",
    clientBrandSubtitle: "Portal Personal de Cliente",
    workspaceSwitcherLabel: "Cambiar espacio",
    featuresHeaderLabel: "Funciones",
    accountHeaderLabel: "Cuenta",
    settingsLabel: "Configuración",
    logoutLabel: "Cerrar sesión",
    defaultUser: "Usuario",
    defaultTherapist: "Terapeuta",
    defaultClient: "Cliente",
    adminTitle: "Administración del Sistema e Idiomas",
    adminRoleLabel: "Administrador",
    adminNavI18n: "Idiomas y Traducciones",
    adminNavUsers: "Usuarios & Roles",
    adminNavManagement: "KPI & Gestión",
    adminNavClinic: "Clínica & Registro",
    therapistClinicTitle: "Administración de Clínica & Registro",
    therapistWorkspaceTitle: "Espacio del Terapeuta",
    therapistRoleLabel: "Terapeuta",
    therapistNavOverview: "Resumen",
    therapistNavTimeline: "Línea de Tiempo",
    therapistNavCalendar: "Calendario",
    therapistNavClinicCvr: "Clínica & Registro",
    therapistNavPcl5: "Cribado PCL-5",
    therapistNavFinance: "Finanzas & Facturas",
    therapistTabOverview: "Clínica & Historia",
    therapistOpenTimelineCta: "Abrir línea de tiempo clínica",
    therapistSubtitle:
      "Vista clínica integral de clientes, notas terapéuticas, citas y gestión de consulta",
    clientSettingsTitle: "Configuración de Perfil & Clínica",
    clientClinicTitle: "Hazte Terapeuta — Alta de Clínica",
    clientPortalTitle: "Mi Portal de Cliente",
    clientRoleLabel: "Cliente",
    clientNavOverview: "Resumen",
    clientNavAppointments: "Citas",
    clientNavJournal: "Mi Diario",
    clientNavMarketplace: "Clínicas & Práctica",
    clientNavConsents: "Consentimientos & Perfil",
    clientNavPcl5: "Prueba PCL-5",
    clientNavFinance: "Facturación & Pagos",
    clientSecureBadge: "Portal de Cliente Seguro",
    clientDefaultSecure: "Conexión clínica cifrada activa",
    clientGreetingPrefix: "Bienvenido",
    clientSecurityCheckPrefix: "Control de seguridad",
    clientBookSessionCta: "Reservar nueva sesión",
    clientFindTherapistBtn: "Buscar terapeuta",
    clientCardAppointmentsTitle: "Mis Citas",
    clientCardAppointmentsDesc: "Ver próximas sesiones o reservar una cita",
    clientCardJournalTitle: "Mi Diario",
    clientCardJournalDesc: "Escribe reflexiones personales y controla qué compartes",
    clientCardConsentsTitle: "Consentimientos & Perfil",
    clientCardConsentsDesc: "Gestionar tu perfil y compartición de datos",
    clientCardPcl5Title: "Cribado PCL-5",
    clientCardPcl5Desc: "Completar y seguir tus evaluaciones clínicas",
    upgradeLabel: "Hazte terapeuta",
    upgradeDescription: "Crear perfil de clínica con registro",
    missingPrefix: "Falta",
    verifiedTherapist: "Terapeuta verificado",
    systemAdmin: "Administrador del sistema",
  },
  de: {
    portalClient: "Klientenportal",
    portalTherapist: "Therapeutenportal",
    portalAdmin: "Administration",
    adminBrandSubtitle: "Admin- & Governance-Portal",
    therapistBrandSubtitle: "Klinischer Therapeuten-Arbeitsbereich",
    clientBrandSubtitle: "Persönliches Klientenportal",
    workspaceSwitcherLabel: "Arbeitsbereich wechseln",
    featuresHeaderLabel: "Funktionen",
    accountHeaderLabel: "Konto",
    settingsLabel: "Einstellungen",
    logoutLabel: "Abmelden",
    defaultUser: "Benutzer",
    defaultTherapist: "Therapeut",
    defaultClient: "Klient",
    adminTitle: "System- & Sprachverwaltung",
    adminRoleLabel: "Administrator",
    adminNavI18n: "Sprachen & Übersetzungen",
    adminNavUsers: "Benutzer & Rollen",
    adminNavManagement: "KPI & Leitung",
    adminNavClinic: "Klinik & Register",
    therapistClinicTitle: "Klinik- & Registerverwaltung",
    therapistWorkspaceTitle: "Therapeuten-Arbeitsbereich",
    therapistRoleLabel: "Therapeut",
    therapistNavOverview: "Übersicht",
    therapistNavTimeline: "Patienten-Zeitachse",
    therapistNavCalendar: "Kalender",
    therapistNavClinicCvr: "Klinik & Praxis",
    therapistNavPcl5: "PCL-5 Screener",
    therapistNavFinance: "Finanzen & Rechnungen",
    therapistTabOverview: "Klinik & Akte",
    therapistOpenTimelineCta: "Semantische Patienten-Zeitachse öffnen",
    therapistSubtitle:
      "Klinische Übersicht über Klienten, Verlaufsnotizen, Termine und Praxisbetrieb",
    clientSettingsTitle: "Profil- & Klinikeinstellungen",
    clientClinicTitle: "Therapeut werden — Klinik-Onboarding",
    clientPortalTitle: "Mein Klientenportal",
    clientRoleLabel: "Klient",
    clientNavOverview: "Übersicht",
    clientNavAppointments: "Termine",
    clientNavJournal: "Mein Tagebuch",
    clientNavMarketplace: "Klinik & Praxis",
    clientNavConsents: "Einwilligung & Profil",
    clientNavPcl5: "PCL-5 Test",
    clientNavFinance: "Rechnung & Zahlung",
    clientSecureBadge: "Sicheres Klientenportal",
    clientDefaultSecure: "Verschlüsselte klinische Verbindung aktiv",
    clientGreetingPrefix: "Willkommen",
    clientSecurityCheckPrefix: "Sicherheitsprüfung",
    clientBookSessionCta: "Neue Sitzung buchen",
    clientFindTherapistBtn: "Therapeut finden",
    clientCardAppointmentsTitle: "Meine Termine",
    clientCardAppointmentsDesc: "Kommende Sitzungen ansehen oder Termin buchen",
    clientCardJournalTitle: "Mein Tagebuch",
    clientCardJournalDesc: "Persönliche Reflexionen schreiben und Freigabe steuern",
    clientCardConsentsTitle: "Einwilligung & Profil",
    clientCardConsentsDesc: "Profil und Datenfreigabe verwalten",
    clientCardPcl5Title: "PCL-5 Screening",
    clientCardPcl5Desc: "Klinische Fragebögen ausfüllen und verfolgen",
    upgradeLabel: "Therapeut werden",
    upgradeDescription: "Klinikprofil mit Registernummer anlegen",
    missingPrefix: "Fehlt",
    verifiedTherapist: "Verifizierter Therapeut",
    systemAdmin: "Systemadministrator",
  },
};

function getPortalCopy(locale?: string): PortalLocaleCopy {
  return PORTAL_COPY_BY_LOCALE[resolveUiLocale(locale)];
}

export interface ResolvedPortalShellConfig {
  activeArea: PortalArea;
  brandTitle: string;
  brandSubtitle: string;
  pageTitle: string;
  roleLabel: string;
  roleBadge: UserRole;
  navItems: PortalWorkspaceNavItem[];
  portalOptions: PortalSwitcherOption[];
  upgradeAction?: PortalUpgradeAction;
  defaultSidebarCollapsed: boolean;
  settingsHref: string;
  profileSubtext?: string;
}

/**
 * Konverterer `/api/backend/clinic/me` payload til frontendens RBAC-brugerkontrakt.
 */
export function mapMeToAuthenticatedUser(me: MeUserContext): AuthenticatedUser {
  const normalized = new Set<UserRole>();
  const rawRoles = (me.roles || []).map((role) => role.toUpperCase());

  if (
    me.isTherapist ||
    rawRoles.includes("THERAPIST") ||
    rawRoles.includes("PROVIDER")
  ) {
    normalized.add("PROVIDER");
    normalized.add("THERAPIST");
  }

  if (
    me.isAdmin ||
    rawRoles.includes("ADMIN") ||
    rawRoles.includes("MANAGEMENT")
  ) {
    normalized.add("MANAGEMENT");
    normalized.add("ADMIN");
  }

  if (
    rawRoles.includes("CLIENT") ||
    Boolean(me.clientProfile) ||
    normalized.size === 0
  ) {
    normalized.add("CLIENT");
  }

  return {
    id: me.userUuid || me.username || "anonymous",
    name: me.fullName || me.username || "Bruger",
    email: me.email || "",
    roles: Array.from(normalized),
  };
}

/**
 * Beregner navigation, aktiv portal, rolle-skifter og auto-collapse for App Shell.
 */
export function resolvePortalShellConfig({
  locale,
  pathname,
  tab,
  me,
  pendingHandshakeCount = 0,
}: ResolvePortalShellInput & { pendingHandshakeCount?: number }): ResolvedPortalShellConfig {
  const resolvedLocale = resolveUiLocale(locale);
  const copy = getPortalCopy(resolvedLocale);
  const base = `/${locale}/dashboard`;
  const currentTab = tab || "overview";
  const rawRoles = (me?.roles || []).map((role) => role.toUpperCase());
  const hasTherapistAccess = Boolean(
    me?.isTherapist ||
      rawRoles.includes("THERAPIST") ||
      rawRoles.includes("PROVIDER")
  );
  const hasAdminAccess = Boolean(
    me?.isAdmin ||
      rawRoles.includes("ADMIN") ||
      rawRoles.includes("MANAGEMENT")
  );

  let activeArea: PortalArea = "client";
  if (pathname.includes("/dashboard/admin")) {
    activeArea = "admin";
  } else if (
    pathname.includes("/dashboard/therapist") ||
    (pathname.includes("/dashboard/clinic") && hasTherapistAccess)
  ) {
    activeArea = "therapist";
  }

  const portalOptions: PortalSwitcherOption[] = [
    {
      area: "client",
      href: `${base}/personal`,
      label: copy.portalClient,
      icon: "bi-person-heart",
      active: activeArea === "client",
    },
  ];

  if (hasTherapistAccess || activeArea === "therapist") {
    portalOptions.push({
      area: "therapist",
      href: `${base}/therapist`,
      label: copy.portalTherapist,
      icon: "bi-heart-pulse",
      active: activeArea === "therapist",
    });
  }

  if (hasAdminAccess || activeArea === "admin") {
    portalOptions.push({
      area: "admin",
      href: `${base}/admin`,
      label: copy.portalAdmin,
      icon: "bi-sliders2",
      active: activeArea === "admin",
    });
  }

  const isSettings = pathname.includes("/dashboard/settings");
  const isClinic = pathname.includes("/dashboard/clinic");

  let navItems: PortalWorkspaceNavItem[];
  let brandSubtitle: string;
  let pageTitle: string;
  let roleLabel: string;
  let roleBadge: UserRole;

  if (activeArea === "admin") {
    brandSubtitle = copy.adminBrandSubtitle;
    pageTitle = copy.adminTitle;
    roleLabel = copy.adminRoleLabel;
    roleBadge = "ADMIN";
    navItems = [
      {
        href: `${base}/admin`,
        label: copy.adminNavI18n,
        icon: "bi-translate",
        active: !isSettings && !isClinic && currentTab === "overview",
      },
      {
        href: `${base}/admin?tab=users`,
        label: copy.adminNavUsers,
        icon: "bi-people",
        active: !isSettings && !isClinic && currentTab === "users",
      },
      {
        href: `${base}/admin?tab=management`,
        label: copy.adminNavManagement,
        icon: "bi-graph-up-arrow",
        active: !isSettings && !isClinic && currentTab === "management",
      },
      {
        href: `${base}/clinic`,
        label: copy.adminNavClinic,
        icon: "bi-building",
        active: isClinic && !isSettings,
      },
      {
        href: `${base}/settings`,
        label: copy.settingsLabel,
        icon: "bi-gear",
        active: isSettings,
      },
    ];
  } else if (activeArea === "therapist") {
    brandSubtitle = copy.therapistBrandSubtitle;
    pageTitle = isClinic
      ? copy.therapistClinicTitle
      : copy.therapistWorkspaceTitle;
    roleLabel = copy.therapistRoleLabel;
    roleBadge = "PROVIDER";
    navItems = [
      {
        href: `${base}/therapist`,
        label: copy.therapistNavOverview,
        icon: "bi-window-stack",
        active: !isClinic && !isSettings && currentTab === "overview",
      },
      {
        href: `${base}/therapist?tab=timeline`,
        label: copy.therapistNavTimeline,
        icon: "bi-clock-history",
        active: !isClinic && !isSettings && currentTab === "timeline",
      },
      {
        href: `${base}/therapist?tab=calendar`,
        label: copy.therapistNavCalendar,
        icon: "bi-calendar3",
        active: !isClinic && !isSettings && currentTab === "calendar",
      },
      {
        href: `${base}/clinic`,
        label: copy.therapistNavClinicCvr,
        icon: "bi-building",
        active: !isSettings && (isClinic || currentTab === "clinic_cvr"),
        badge: pendingHandshakeCount > 0 ? String(pendingHandshakeCount) : undefined,
      },
      {
        href: `${base}/therapist?tab=pcl5`,
        label: copy.therapistNavPcl5,
        icon: "bi-clipboard2-pulse",
        active: !isClinic && !isSettings && currentTab === "pcl5",
      },
      {
        href: `${base}/therapist?tab=finance`,
        label: copy.therapistNavFinance,
        icon: "bi-cash-stack",
        active: !isClinic && !isSettings && currentTab === "finance",
      },
      {
        href: `${base}/settings`,
        label: copy.settingsLabel,
        icon: "bi-gear",
        active: isSettings,
      },
    ];
  } else {
    brandSubtitle = copy.clientBrandSubtitle;
    pageTitle = isSettings
      ? copy.clientSettingsTitle
      : isClinic
        ? copy.clientClinicTitle
        : copy.clientPortalTitle;
    roleLabel = copy.clientRoleLabel;
    roleBadge = "CLIENT";
    navItems = [
      {
        href: `${base}/personal`,
        label: copy.clientNavOverview,
        icon: "bi-grid-1x2",
        active: !isSettings && !isClinic && currentTab === "overview",
      },
      {
        href: `${base}/personal?tab=appointments`,
        label: copy.clientNavAppointments,
        icon: "bi-calendar-check",
        active: !isSettings && !isClinic && currentTab === "appointments",
      },
      {
        href: `${base}/personal?tab=journal`,
        label: copy.clientNavJournal,
        icon: "bi-journal-bookmark",
        active: !isSettings && !isClinic && currentTab === "journal",
      },
      {
        href: `${base}/personal?tab=marketplace`,
        label: copy.clientNavMarketplace,
        icon: "bi-shop",
        active: !isSettings && !isClinic && currentTab === "marketplace",
      },
      {
        href: `${base}/personal?tab=consents`,
        label: copy.clientNavConsents,
        icon: "bi-shield-check",
        active: !isSettings && !isClinic && currentTab === "consents",
      },
      {
        href: `${base}/personal?tab=pcl5`,
        label: copy.clientNavPcl5,
        icon: "bi-clipboard2-pulse",
        active: !isSettings && !isClinic && currentTab === "pcl5",
      },
      {
        href: `${base}/personal?tab=finance`,
        label: copy.clientNavFinance,
        icon: "bi-receipt",
        active: !isSettings && !isClinic && currentTab === "finance",
      },
      {
        href: `${base}/settings`,
        label: copy.settingsLabel,
        icon: "bi-gear",
        active: isSettings,
      },
    ];
  }

  const upgradeAction: PortalUpgradeAction | undefined =
    !hasTherapistAccess && !hasAdminAccess
      ? {
          label: copy.upgradeLabel,
          href: `${base}/clinic`,
          icon: "bi-briefcase-fill",
          description: copy.upgradeDescription,
        }
      : undefined;

  let profileSubtext: string | undefined;
  if (me?.missingProfileFields && me.missingProfileFields.length > 0) {
    profileSubtext = `${copy.missingPrefix}: ${me.missingProfileFields
      .map((field) => localizeMissingField(field, resolvedLocale))
      .join(", ")}`;
  } else if (hasTherapistAccess) {
    profileSubtext = copy.verifiedTherapist;
  } else if (hasAdminAccess) {
    profileSubtext = copy.systemAdmin;
  }

  return {
    activeArea,
    brandTitle: "EduJournal",
    brandSubtitle,
    pageTitle,
    roleLabel,
    roleBadge,
    navItems,
    portalOptions,
    upgradeAction,
    defaultSidebarCollapsed: false,
    settingsHref: `${base}/settings`,
    profileSubtext,
  };
}

export interface ConnectedPortalWorkspaceShellProps
  extends Partial<PortalWorkspaceShellProps> {
  locale?: string;
  pathname?: string;
  activeTab?: string | null;
  initialMe?: MeUserContext | null;
  onLocaleNavigate?: (nextLocale: string) => void;
  children: React.ReactNode;
}

/**
 * Forbinder `PortalWorkspaceShell` fra `baseUiCore.tsx` med `/api/backend/clinic/me`,
 * RBAC `<AuthProvider />`, sprogvælger og App Router navigation.
 */
export const ConnectedPortalWorkspaceShell: React.FC<
  ConnectedPortalWorkspaceShellProps
> = ({
  title,
  locale,
  pathname,
  activeTab = null,
  initialMe,
  onLocaleNavigate,
  onNavigate,
  onLogout,
  headerActions,
  children,
  ...rest
}) => {
  const i18nCache = useI18nCache();
  const effectiveLocale = locale ?? i18nCache?.locale ?? "da";
  const effectivePathname = pathname ?? `/${effectiveLocale}/dashboard/personal`;
  const copy = useMemo(() => getPortalCopy(effectiveLocale), [effectiveLocale]);
  const [me, setMe] = useState<MeUserContext | null>(initialMe ?? null);
  const [pendingHandshakeCount, setPendingHandshakeCount] = useState(0);

  const loadMeContext = useCallback(() => {
    if (initialMe !== undefined) {
      setMe(initialMe);
      return () => {};
    }

    let cancelled = false;
    fetch("/api/backend/clinic/me", { credentials: "same-origin", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (
          !cancelled &&
          data &&
          typeof data === "object" &&
          !Array.isArray(data) &&
          (data.userUuid || data.username || Array.isArray(data.roles))
        ) {
          setMe(data as MeUserContext);
        }
      })
      .catch(() => {
        // Fallback gracefully when running frontend standalone or offline
      });

    return () => {
      cancelled = true;
    };
  }, [initialMe]);

  useEffect(() => {
    const cancel = loadMeContext();
    if (initialMe !== undefined) {
      return cancel;
    }
    const handleRefresh = () => {
      loadMeContext();
    };
    window.addEventListener("edujournal:me-refresh", handleRefresh);
    return () => {
      cancel();
      window.removeEventListener("edujournal:me-refresh", handleRefresh);
    };
  }, [initialMe, loadMeContext]);

  useEffect(() => {
    if (initialMe !== undefined || !me?.userUuid) {
      setPendingHandshakeCount(0);
      return;
    }
    const roles = (me.roles || []).map((r) => r.toUpperCase());
    const hasTherapistAccess = Boolean(me.isTherapist) || roles.includes("THERAPIST") || roles.includes("PROVIDER");
    if (!hasTherapistAccess) {
      setPendingHandshakeCount(0);
      return;
    }
    let cancelled = false;
    fetch(`/api/backend/clinic/handshakes/therapist/${encodeURIComponent(me.userUuid)}`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (res) => (res.ok ? res.json() : []))
      .then((rows) => {
        if (!cancelled && Array.isArray(rows)) {
          setPendingHandshakeCount(
            rows.filter((hs: any) => String(hs?.status || "").toUpperCase() === "REQUESTED").length
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialMe, me]);

  const shellConfig = useMemo(
    () =>
      resolvePortalShellConfig({
        locale: effectiveLocale,
        pathname: effectivePathname,
        tab: activeTab,
        me,
        pendingHandshakeCount,
      }),
    [effectiveLocale, effectivePathname, activeTab, me, pendingHandshakeCount]
  );

  const authenticatedUser = useMemo(
    () => (me ? mapMeToAuthenticatedUser(me) : null),
    [me]
  );

  const effectiveUserName =
    rest.userName || me?.fullName || me?.username || copy.defaultUser;
  const effectiveUserEmail = rest.userEmail ?? me?.email;

  return (
    <PortalWorkspaceShell
      brandTitle={title ?? rest.brandTitle ?? shellConfig.brandTitle}
      brandSubtitle={rest.brandSubtitle ?? shellConfig.brandSubtitle}
      pageTitle={rest.pageTitle ?? shellConfig.pageTitle}
      roleLabel={rest.roleLabel ?? shellConfig.roleLabel}
      roleBadge={rest.roleBadge ?? shellConfig.roleBadge}
      userName={effectiveUserName}
      userEmail={effectiveUserEmail}
      profileSubtext={rest.profileSubtext ?? shellConfig.profileSubtext}
      settingsHref={rest.settingsHref ?? shellConfig.settingsHref}
      settingsLabel={rest.settingsLabel ?? copy.settingsLabel}
      logoutLabel={rest.logoutLabel ?? copy.logoutLabel}
      accountSettingsHeader={rest.accountSettingsHeader ?? copy.accountHeaderLabel}
      workspaceSwitcherLabel={
        rest.workspaceSwitcherLabel ?? copy.workspaceSwitcherLabel
      }
      featuresHeaderLabel={rest.featuresHeaderLabel ?? copy.featuresHeaderLabel}
      navItems={rest.navItems ?? shellConfig.navItems}
      portalOptions={rest.portalOptions ?? shellConfig.portalOptions}
      upgradeAction={rest.upgradeAction ?? shellConfig.upgradeAction}
      defaultSidebarCollapsed={
        rest.defaultSidebarCollapsed ?? shellConfig.defaultSidebarCollapsed
      }
      onNavigate={onNavigate}
      onLogout={onLogout}
      shellError={rest.shellError}
      onDismissShellError={rest.onDismissShellError}
      headerNav={rest.headerNav}
      headerActions={
        <>
          {headerActions}
          <LanguageSwitcher
            currentLocale={effectiveLocale}
            onLocaleNavigate={onLocaleNavigate}
          />
        </>
      }
    >
      <AuthProvider user={authenticatedUser}>{children}</AuthProvider>
    </PortalWorkspaceShell>
  );
};

export type TherapistTab =
  | "overview"
  | "timeline"
  | "calendar"
  | "clinic_cvr"
  | "pcl5"
  | "finance";

export interface TherapistMultiWindowWorkspaceProps {
  locale?: string;
  therapistName?: string;
  initialTab?: TherapistTab;
  activeTab?: TherapistTab;
  onTabChange?: (tab: TherapistTab) => void;
  onRoleUpgraded?: () => Promise<void> | void;
}

/**
 * Samlet arbejdsområde for behandlere (`PROVIDER`), der kombinerer Klientprofiler,
 * Journaler (JGit), Aftalekalender (Timefold), PCL-5 og Økonomi i ét overskueligt workspace.
 */
export const TherapistMultiWindowWorkspace: React.FC<
  TherapistMultiWindowWorkspaceProps
> = ({
  locale,
  therapistName,
  initialTab = "overview",
  activeTab: controlledActiveTab,
  onTabChange,
  onRoleUpgraded,
}) => {
  const i18nCache = useI18nCache();
  const activeLocale = resolveUiLocale(locale ?? i18nCache?.locale ?? "da");
  const copy = useMemo(() => getPortalCopy(activeLocale), [activeLocale]);
  const innerCopy = CLINIC_INNER_COPY[activeLocale];
  const auth = useOptionalAuth();
  const displayTherapistName = therapistName ?? copy.defaultTherapist;
  const [internalTab, setInternalTab] = useState<TherapistTab>(initialTab);
  const [pendingHandshakes, setPendingHandshakes] = useState<ClientTherapistHandshakeDto[]>([]);

  useEffect(() => {
    setInternalTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    void onTabChange;
  }, [onTabChange]);

  const activeTab = controlledActiveTab ?? internalTab;

  useEffect(() => {
    if (activeTab !== "overview" || !auth?.user.id) {
      return;
    }
    let cancelled = false;
    const loadPendingHandshakes = () => {
      fetch(`/api/backend/clinic/handshakes/therapist/${encodeURIComponent(auth.user.id)}`, {
        credentials: "same-origin",
      })
        .then(async (res) => (res.ok ? res.json() : []))
        .then((rows) => {
          if (!cancelled && Array.isArray(rows)) {
            setPendingHandshakes(
              rows.filter((hs: ClientTherapistHandshakeDto) => String(hs.status || "").toUpperCase() === "REQUESTED")
            );
          }
        })
        .catch(() => {});
    };
    loadPendingHandshakes();
    window.addEventListener("edujournal:me-refresh", loadPendingHandshakes);
    return () => {
      cancelled = true;
      window.removeEventListener("edujournal:me-refresh", loadPendingHandshakes);
    };
  }, [activeTab, auth?.user.id]);

  return (
    <div
      className="space-y-6"
      data-testid="therapist-multi-window-workspace"
      data-active-tab={activeTab}
    >
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs lg:flex-row lg:items-center lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
            <i className="bi bi-heart-pulse" aria-hidden="true" />
            {copy.therapistWorkspaceTitle}
          </span>
          <h1
            className="mt-2 text-2xl font-bold tracking-tight text-slate-900"
            data-testid="therapist-greeting"
          >
            {copy.therapistWorkspaceTitle}: {displayTherapistName}
          </h1>
          <p className="mt-1 mb-0 text-sm text-slate-600">
            {copy.therapistSubtitle}
          </p>
        </div>
        {activeTab !== "timeline" && (
          <button
            type="button"
            data-testid="therapist-open-timeline-btn"
            onClick={() => {
              setInternalTab("timeline");
              onTabChange?.("timeline");
            }}
            className="min-h-11 w-fit self-start lg:self-auto inline-flex shrink-0 items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
          >
            <i className="bi bi-clock-history" aria-hidden="true" />
            {copy.therapistOpenTimelineCta}
          </button>
        )}
      </header>

      {activeTab === "overview" && pendingHandshakes.length > 0 && (
        <div
          data-testid="therapist-pending-handshakes-alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-5 py-3.5 text-xs text-amber-950 shadow-xs"
        >
          <div className="space-y-0.5">
            <strong className="text-sm font-bold text-amber-950">
              {innerCopy.pendingHandshakeAlertTitle} ({pendingHandshakes.length})
            </strong>
            <p className="m-0 text-amber-900">
              {pendingHandshakes.length} {innerCopy.pendingHandshakeAlertDesc}
            </p>
          </div>
          <button
            type="button"
            data-testid="therapist-review-handshakes-btn"
            onClick={() => {
              setInternalTab("clinic_cvr");
              onTabChange?.("clinic_cvr");
            }}
            className="min-h-11 rounded-xl bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800"
          >
            {innerCopy.openClinicCvrBtn}
          </button>
        </div>
      )}

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs xl:col-span-12">
            <ClinicPlatformFeatureView />
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs xl:col-span-6">
            <JournalFeatureView portalMode="provider" />
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs xl:col-span-6">
            <AppointmentFeatureView portalMode="provider" />
          </div>
        </div>
      )}

      {activeTab === "timeline" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="therapist-timeline-panel"
        >
          <PatientTimelineContainer locale={locale} />
        </section>
      )}

      {activeTab === "calendar" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="therapist-calendar-panel"
        >
          <AppointmentFeatureView portalMode="provider" />
        </section>
      )}

      {activeTab === "clinic_cvr" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="clinic-cvr-panel"
        >
          <TherapistClinicOnboardingView />
        </section>
      )}

      {activeTab === "pcl5" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="therapist-pcl5-panel"
        >
          <PsychotraumatologyFeatureView portalMode="provider" />
        </section>
      )}

      {activeTab === "finance" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="therapist-finance-panel"
        >
          <FinanceFeatureView portalMode="provider" onRoleUpgraded={onRoleUpgraded} />
        </section>
      )}
    </div>
  );
};

export type ClientTab =
  | "overview"
  | "appointments"
  | "journal"
  | "marketplace"
  | "consents"
  | "pcl5"
  | "finance";

export interface ClientPortalWorkspaceProps {
  locale?: string;
  userName?: string;
  secureStatus?: string | null;
  initialTab?: ClientTab;
  activeTab?: ClientTab;
  onTabChange?: (tab: ClientTab) => void;
  onRoleUpgraded?: () => Promise<void> | void;
}

/**
 * Borger/Klient-arbejdsområde (`CLIENT`), der giver adgang til selvbetjent booking,
 * personlig dagbog, markedsplads, samtykke, PCL-5 screening og fakturaer i en rolig Nordic HealthTech-skal.
 */
export const ClientPortalWorkspace: React.FC<ClientPortalWorkspaceProps> = ({
  locale,
  userName,
  secureStatus = null,
  initialTab = "overview",
  activeTab: controlledActiveTab,
  onTabChange,
  onRoleUpgraded,
}) => {
  const i18nCache = useI18nCache();
  const copy = useMemo(
    () => getPortalCopy(locale ?? i18nCache?.locale ?? "da"),
    [locale, i18nCache?.locale]
  );
  const displayUserName = userName ?? copy.defaultClient;
  const sanitizedSecureStatus =
    secureStatus &&
    secureStatus.trim().length > 0 &&
    !/sensitive enterprise data/i.test(secureStatus)
      ? secureStatus
      : copy.clientDefaultSecure;
  const [internalTab, setInternalTab] = useState<ClientTab>(initialTab);

  useEffect(() => {
    setInternalTab(initialTab);
  }, [initialTab]);

  const activeTab = controlledActiveTab ?? internalTab;

  const selectTab = (next: ClientTab) => {
    setInternalTab(next);
    onTabChange?.(next);
  };

  return (
    <div
      className="space-y-6"
      data-testid="client-portal-workspace"
      data-active-tab={activeTab}
    >
      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
              <i className="bi bi-shield-lock" aria-hidden="true" />
              {copy.clientSecureBadge}
            </span>
            <h1
              className="mt-2 text-2xl font-bold tracking-tight text-slate-900"
              data-testid="client-greeting"
            >
              {copy.clientGreetingPrefix}, {displayUserName}
            </h1>
            <p
              className="mt-1 mb-0 text-xs font-medium text-emerald-700"
              data-testid="client-secure-status"
            >
              {copy.clientSecurityCheckPrefix}: {sanitizedSecureStatus}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="client-find-therapist-btn"
              onClick={() => selectTab("marketplace")}
              className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100"
            >
              <i className="bi bi-shop" aria-hidden="true" />
              {copy.clientFindTherapistBtn}
            </button>
            <button
              type="button"
              onClick={() => selectTab("appointments")}
              className="min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-800"
            >
              <i className="bi bi-calendar-plus" aria-hidden="true" />
              {copy.clientBookSessionCta}
            </button>
          </div>
        </div>
      </header>

      {activeTab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              onClick={() => selectTab("appointments")}
              className="min-h-11 flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-xs transition-colors hover:border-teal-300 hover:bg-teal-50/30"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
                <i className="bi bi-calendar-check text-lg" aria-hidden="true" />
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {copy.clientCardAppointmentsTitle}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {copy.clientCardAppointmentsDesc}
                </div>
              </div>
            </button>

            <button
              type="button"
              data-testid="client-card-journal"
              onClick={() => selectTab("journal")}
              className="min-h-11 flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-xs transition-colors hover:border-teal-300 hover:bg-teal-50/30"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <i className="bi bi-journal-bookmark text-lg" aria-hidden="true" />
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {copy.clientCardJournalTitle}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {copy.clientCardJournalDesc}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => selectTab("consents")}
              className="min-h-11 flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-xs transition-colors hover:border-teal-300 hover:bg-teal-50/30"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <i className="bi bi-shield-check text-lg" aria-hidden="true" />
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {copy.clientCardConsentsTitle}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {copy.clientCardConsentsDesc}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => selectTab("pcl5")}
              className="min-h-11 flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-xs transition-colors hover:border-teal-300 hover:bg-teal-50/30"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <i
                  className="bi bi-clipboard2-pulse text-lg"
                  aria-hidden="true"
                />
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {copy.clientCardPcl5Title}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {copy.clientCardPcl5Desc}
                </div>
              </div>
            </button>
          </div>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <BookingFeatureView portalMode="client" />
          </section>
        </div>
      )}

      {activeTab === "appointments" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="client-appointments-panel"
        >
          <BookingFeatureView portalMode="client" />
        </section>
      )}

      {activeTab === "journal" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="client-journal-panel"
        >
          <JournalFeatureView portalMode="client" />
        </section>
      )}

      {activeTab === "marketplace" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="client-marketplace-panel"
        >
          <ClientMarketplaceView />
        </section>
      )}

      {activeTab === "consents" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="client-consents-panel"
        >
          <ClientConsentAndProfileView />
        </section>
      )}

      {activeTab === "pcl5" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="client-pcl5-panel"
        >
          <PsychotraumatologyFeatureView portalMode="client" />
        </section>
      )}

      {activeTab === "finance" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="client-finance-panel"
        >
          <FinanceFeatureView portalMode="client" onRoleUpgraded={onRoleUpgraded} />
        </section>
      )}
    </div>
  );
};

export const ClientMarketplaceView: React.FC = () => {
  const auth = useOptionalAuth();
  const locale = useUiLocale();
  const copy = CLINIC_INNER_COPY[locale];
  const [providers, setProviders] = useState<ProviderProfileDto[]>([]);
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [handshakes, setHandshakes] = useState<ClientTherapistHandshakeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ProblemDetail | null>(null);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");

  const clientUuid = auth?.user.id || "";
  const clientName = auth?.user.name || "";

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    try {
      const dir = await requestClinicJson<{
        providers?: ProviderProfileDto[];
        services?: ServiceDto[];
      }>("/api/backend/clinic/directory");
      setProviders(Array.isArray(dir.providers) ? dir.providers : []);
      setServices(Array.isArray(dir.services) ? dir.services : []);
      if (clientUuid) {
        const hs = await requestClinicJson<ClientTherapistHandshakeDto[]>(
          `/api/backend/clinic/handshakes/client/${encodeURIComponent(clientUuid)}`
        );
        setHandshakes(Array.isArray(hs) ? hs : []);
      }
      setError(null);
    } catch (err) {
      setError(toProblemDetail(err));
    } finally {
      setLoading(false);
    }
  }, [clientUuid]);

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  const requestHandshake = async (provider: ProviderProfileDto) => {
    try {
      await requestClinicJson("/api/backend/clinic/handshakes", {
        method: "POST",
        body: JSON.stringify({
          clientUuid,
          clientName,
          therapistUuid: provider.userUuid,
          therapistName: provider.displayName,
          organisationName: provider.organisation?.name,
          status: "REQUESTED",
          allowedBranches: "PSYCHOLOGY",
        }),
      });
      await loadDirectory();
    } catch (err) {
      setError(toProblemDetail(err));
    }
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleProviders = deduplicateClinicProviders(
    providers.filter((p) => !clientUuid || p.userUuid !== clientUuid)
  ).filter((provider) => {
    if (!normalizedQuery) return true;
    const providerServices = services.filter((s) => s.provider?.id === provider.id);
    const matchesService = providerServices.some((s) =>
      (s.name || "").toLowerCase().includes(normalizedQuery)
    );
    return (
      (provider.displayName || "").toLowerCase().includes(normalizedQuery) ||
      (provider.organisation?.name || "").toLowerCase().includes(normalizedQuery) ||
      (provider.organisation?.cvrNumber || "").toLowerCase().includes(normalizedQuery) ||
      matchesService
    );
  });
  const totalPages = Math.max(1, Math.ceil(visibleProviders.length / CLINIC_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedProviders = visibleProviders.slice(
    (safePage - 1) * CLINIC_PAGE_SIZE,
    safePage * CLINIC_PAGE_SIZE
  );

  return (
    <div className="space-y-5" data-testid="client-marketplace-view">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
            <i className="bi bi-shop" aria-hidden="true" />
            {copy.marketplaceBadge}
          </span>
          <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">
            {copy.marketplaceHeading}
          </h2>
        </div>
        <input
          type="search"
          aria-label={copy.marketplaceSearchPlaceholder}
          data-testid="marketplace-search-input"
          placeholder={copy.marketplaceSearchPlaceholder}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(1);
          }}
          className="min-h-11 w-full sm:w-72 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
        />
      </div>

      <ProblemAlert error={error} onDismiss={() => setError(null)} />

      {loading ? (
        <p data-testid="loading-indicator" className="text-sm text-slate-500">
          {copy.loadingProviders}
        </p>
      ) : visibleProviders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
          {copy.emptyProviders}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="marketplace-provider-list">
            {pagedProviders.map((provider) => {
              const pUuid = provider.userUuid || "";
              const providerServices = deduplicateClinicServices(
                services.filter((s) => s.provider?.id === provider.id)
              );
              const activeHandshake = handshakes.find(
                (h) => h.therapistUuid === pUuid
              );
              return (
                <div
                  key={provider.id || pUuid}
                  data-testid={`marketplace-provider-${pUuid}`}
                  className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">
                          {provider.displayName}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {provider.organisation?.name} ({copy.regIdLabel}: {provider.organisation?.cvrNumber})
                        </p>
                      </div>
                      {activeHandshake && (
                        <span
                          data-testid={`handshake-status-${pUuid}`}
                          className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800"
                        >
                          {localizeHandshakeStatus(activeHandshake.status, locale)}
                        </span>
                      )}
                    </div>
                    {providerServices.length > 0 && (
                      <ul className="space-y-1 pt-1 text-xs text-slate-700">
                        {providerServices.map((srv) => (
                          <li
                            key={srv.id}
                            className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5"
                          >
                            <span>
                              {srv.name} ({srv.durationMinutes} min)
                            </span>
                            <strong>
                              {srv.price ?? srv.priceDkk} {srv.currency || "DKK"}
                            </strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {!activeHandshake && clientUuid && pUuid && (
                    <button
                      type="button"
                      data-testid={`request-handshake-${pUuid}`}
                      onClick={() => void requestHandshake(provider)}
                      className="min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                    >
                      {copy.requestCourseBtn}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {visibleProviders.length > CLINIC_PAGE_SIZE && (
            <div
              className="flex items-center justify-between gap-2 pt-2"
              data-testid="marketplace-pagination"
            >
              <button
                type="button"
                disabled={safePage <= 1}
                data-testid="marketplace-prev"
                onClick={() => setPage(Math.max(1, safePage - 1))}
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                {copy.prevPageBtn}
              </button>
              <span className="text-xs font-medium text-slate-600">
                {copy.pageLabel} {safePage} {copy.ofLabel} {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                data-testid="marketplace-next"
                onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                {copy.nextPageBtn}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const ClientConsentAndProfileView: React.FC = () => {
  const auth = useOptionalAuth();
  const locale = useUiLocale();
  const copy = CLINIC_INNER_COPY[locale];
  const [userUuid, setUserUuid] = useState(auth?.user.id || "");
  const [fullName, setFullName] = useState(auth?.user.name || "");
  const [email, setEmail] = useState(auth?.user.email || "");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [handshakes, setHandshakes] = useState<ClientTherapistHandshakeDto[]>([]);
  const [savedBanner, setSavedBanner] = useState(false);
  const [sharingSavedId, setSharingSavedId] = useState<string | null>(null);
  const [expandedHandshakeId, setExpandedHandshakeId] = useState<string | null>(null);
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");
  const [noMoodScores, setNoMoodScores] = useState(false);
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);
  const [error, setError] = useState<ProblemDetail | null>(null);

  const loadProfileAndConsents = useCallback(async () => {
    try {
      const me = await requestClinicJson<MeUserContext>("/api/backend/clinic/me");
      const resolvedId = me.userUuid || "";
      setUserUuid(resolvedId);
      setFullName(me.clientProfile?.fullName || me.fullName || "");
      setEmail(me.clientProfile?.email || me.email || "");
      setPhoneNumber(me.clientProfile?.phoneNumber || "");
      setDateOfBirth(me.clientProfile?.dateOfBirth || "");
      setHomeAddress(me.clientProfile?.homeAddress || "");
      setPostalCode(me.clientProfile?.postalCode || "");
      if (resolvedId) {
        const list = await requestClinicJson<ClientTherapistHandshakeDto[]>(
          `/api/backend/clinic/handshakes/client/${encodeURIComponent(resolvedId)}`
        );
        setHandshakes(Array.isArray(list) ? list : []);
      }
      setError(null);
    } catch (err) {
      setError(toProblemDetail(err));
    }
  }, []);

  useEffect(() => {
    void loadProfileAndConsents();
  }, [loadProfileAndConsents]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedBanner(false);
    try {
      DomainGuard.requireNotBlank(fullName, "Client full name", "fullName");
      await requestClinicJson("/api/backend/clinic/client-profile", {
        method: "PUT",
        body: JSON.stringify({
          userId: userUuid,
          fullName: fullName.trim(),
          email: email.trim(),
          phoneNumber: phoneNumber.trim(),
          dateOfBirth: dateOfBirth.trim(),
          homeAddress: homeAddress.trim(),
          postalCode: postalCode.trim(),
        }),
      });
      setSavedBanner(true);
      setError(null);
    } catch (err) {
      setError(toProblemDetail(err));
    }
  };

  const handleToggleSettings = (hs: ClientTherapistHandshakeDto) => {
    if (!hs.id) {
      return;
    }
    if (expandedHandshakeId === hs.id) {
      setExpandedHandshakeId(null);
      return;
    }
    setSharingSavedId(null);
    setExpandedHandshakeId(hs.id);
    setHistoryStartDate(hs.historyStartDate || "");
    setHistoryEndDate(hs.historyEndDate || "");
    setNoMoodScores((hs.customRestrictions || "").includes("NO_MOOD_SCORES"));
  };

  const handleSaveDataSharing = async (handshakeId: string) => {
    setSharingSavedId(null);
    try {
      await requestClinicJson(
        `/api/backend/clinic/handshakes/${encodeURIComponent(handshakeId)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            historyStartDate: historyStartDate.trim() || "",
            historyEndDate: historyEndDate.trim() || "",
            customRestrictions: noMoodScores ? "NO_MOOD_SCORES" : "",
          }),
        }
      );
      setSharingSavedId(handshakeId);
      setError(null);
      await loadProfileAndConsents();
    } catch (err) {
      setError(toProblemDetail(err));
    }
  };

  const handleRevokeHandshake = async (handshakeId: string) => {
    try {
      await requestClinicJson(
        `/api/backend/clinic/handshakes/${encodeURIComponent(handshakeId)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "REVOKED" }),
        }
      );
      if (expandedHandshakeId === handshakeId) {
        setExpandedHandshakeId(null);
      }
      await loadProfileAndConsents();
    } catch (err) {
      setError(toProblemDetail(err));
    }
  };

  return (
    <div className="space-y-6" data-testid="client-consent-profile-view">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
          <i className="bi bi-shield-check" aria-hidden="true" />
          {copy.consentsBadge}
        </span>
        <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">
          {copy.consentsHeading}
        </h2>
      </div>

      <ProblemAlert error={error} onDismiss={() => setError(null)} />

      {savedBanner && (
        <div
          data-testid="profile-saved-badge"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800"
        >
          {copy.profileSavedBanner}
        </div>
      )}

      {sharingSavedId && (
        <div
          data-testid="handshake-settings-saved"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800"
        >
          {copy.dataSharingSavedBanner}
        </div>
      )}

      <form
        noValidate
        onSubmit={handleSaveProfile}
        data-testid="personal-profile-form"
        className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="profile-fullName"
            className="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            {copy.profileFullNamePlaceholder}
          </label>
          <input
            id="profile-fullName"
            data-testid="input-profile-fullName"
            placeholder={copy.profileFullNamePlaceholder}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="profile-email"
            className="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            {copy.profileEmailPlaceholder}
          </label>
          <input
            id="profile-email"
            data-testid="input-profile-email"
            type="email"
            placeholder={copy.profileEmailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="profile-phone"
            className="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            {copy.profilePhonePlaceholder}
          </label>
          <input
            id="profile-phone"
            data-testid="input-profile-phone"
            placeholder={copy.profilePhonePlaceholder}
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="profile-dob"
            className="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            {copy.profileDobPlaceholder}
          </label>
          <input
            id="profile-dob"
            data-testid="input-profile-dob"
            placeholder={copy.profileDobPlaceholder}
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="profile-address"
            className="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            {copy.profileAddressPlaceholder}
          </label>
          <input
            id="profile-address"
            data-testid="input-profile-address"
            placeholder={copy.profileAddressPlaceholder}
            value={homeAddress}
            onChange={(e) => setHomeAddress(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="profile-postalCode"
            className="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            {copy.profilePostalCodePlaceholder}
          </label>
          <input
            id="profile-postalCode"
            data-testid="input-profile-postalCode"
            placeholder={copy.profilePostalCodePlaceholder}
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div className="sm:col-span-2 flex justify-end pt-1">
          <button
            type="submit"
            data-testid="submit-personal-profile"
            className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            {copy.saveProfileBtn}
          </button>
        </div>
      </form>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">
          {copy.activeHandshakesHeading}
        </h3>
        {handshakes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            {copy.emptyConsents}
          </p>
        ) : (
          <ul className="space-y-2.5" data-testid="client-handshakes-consent-list">
            {handshakes.map((hs) => {
              const isInactive = hs.status === "REVOKED" || hs.status === "TERMINATED";
              const isExpanded = Boolean(hs.id && expandedHandshakeId === hs.id);
              return (
                <li
                  key={hs.id}
                  className="space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <strong>{hs.therapistName || hs.organisationName}</strong> —{" "}
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                        {localizeHandshakeStatus(hs.status, locale)}
                      </span>
                    </div>
                    {hs.id && !isInactive && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          data-testid={`toggle-handshake-settings-${hs.id}`}
                          onClick={() => handleToggleSettings(hs)}
                          className="min-h-11 inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                        >
                          <i className="bi bi-sliders2" aria-hidden="true" />
                          {copy.dataSharingBtn}
                        </button>
                        <button
                          type="button"
                          data-testid={`revoke-handshake-${hs.id}`}
                          onClick={() => setPendingRevokeId(hs.id!)}
                          className="min-h-11 inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          {copy.revokeConsentBtn}
                        </button>
                      </div>
                    )}
                  </div>

                  {isExpanded && hs.id && (
                    <div
                      data-testid={`handshake-settings-panel-${hs.id}`}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3"
                    >
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor={`hs-start-${hs.id}`}
                            className="text-xs font-semibold text-slate-700"
                          >
                            {copy.historyStartLabel}
                          </label>
                          <input
                            id={`hs-start-${hs.id}`}
                            type="date"
                            data-testid={`input-hs-start-${hs.id}`}
                            value={historyStartDate}
                            onChange={(e) => setHistoryStartDate(e.target.value)}
                            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor={`hs-end-${hs.id}`}
                            className="text-xs font-semibold text-slate-700"
                          >
                            {copy.historyEndLabel}
                          </label>
                          <input
                            id={`hs-end-${hs.id}`}
                            type="date"
                            data-testid={`input-hs-end-${hs.id}`}
                            value={historyEndDate}
                            onChange={(e) => setHistoryEndDate(e.target.value)}
                            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                          />
                        </div>
                      </div>
                      <label className="min-h-11 inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          data-testid={`input-hs-no-mood-${hs.id}`}
                          checked={noMoodScores}
                          onChange={(e) => setNoMoodScores(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-teal-700"
                        />
                        <span>{copy.hideMoodScoresLabel}</span>
                      </label>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          data-testid={`save-handshake-settings-${hs.id}`}
                          onClick={() => void handleSaveDataSharing(hs.id!)}
                          className="min-h-11 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                        >
                          {copy.saveDataSharingBtn}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmActionDialog
        open={Boolean(pendingRevokeId)}
        title={copy.confirmRevokeTitle}
        description={copy.confirmRevokeDesc}
        confirmLabel={copy.revokeConsentBtn}
        cancelLabel={copy.cancelBtn}
        tone="danger"
        onCancel={() => setPendingRevokeId(null)}
        onConfirm={() => {
          const id = pendingRevokeId;
          setPendingRevokeId(null);
          if (id) {
            void handleRevokeHandshake(id);
          }
        }}
      />
    </div>
  );
};

export interface TherapistClinicOnboardingViewProps {
  onOnboardingSuccess?: () => void | Promise<void>;
}

export const TherapistClinicOnboardingView: React.FC<
  TherapistClinicOnboardingViewProps
> = ({ onOnboardingSuccess }) => {
  const locale = useUiLocale();
  const copy = CLINIC_INNER_COPY[locale];
  const [me, setMe] = useState<MeUserContext | null>(null);
  const [organisationName, setOrganisationName] = useState("");
  const [cvrNumber, setCvrNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [iban, setIban] = useState("");
  const [currency, setCurrency] = useState("DKK");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [workingHoursJson, setWorkingHoursJson] = useState("09:00-17:00");
  const [serviceName, setServiceName] = useState("");
  const [servicePrice, setServicePrice] = useState("850");
  const [serviceDuration, setServiceDuration] = useState("60");
  const [serviceLocation, setServiceLocation] = useState("Klinik");
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [servicesPage, setServicesPage] = useState(1);
  const [handshakes, setHandshakes] = useState<ClientTherapistHandshakeDto[]>([]);
  const [savedNotice, setSavedNotice] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    | { kind: "delete-service" | "terminate-handshake"; id: string }
    | null
  >(null);
  const [error, setError] = useState<ProblemDetail | null>(null);

  const loadClinicData = useCallback(async () => {
    try {
      const meData = await requestClinicJson<MeUserContext>("/api/backend/clinic/me");
      setMe(meData);
      const prov = meData.providerProfile;
      const org = prov?.organisation;
      setOrganisationName(org?.name || "");
      setCvrNumber(org?.cvrNumber || "");
      setDisplayName(prov?.displayName || meData.fullName || "");
      setIban(prov?.iban || org?.iban || "");
      setCurrency(prov?.currency || org?.currency || "DKK");
      setAddress(org?.address || meData.clientProfile?.homeAddress || "");
      setPostalCode(org?.postalCode || meData.clientProfile?.postalCode || "");
      setPhoneNumber(org?.phoneNumber || meData.clientProfile?.phoneNumber || "");
      setWorkingHoursJson(prov?.workingHoursJson || "09:00-17:00");

      const serviceQuery = meData.userUuid
        ? `?therapistUuid=${encodeURIComponent(meData.userUuid)}`
        : "";
      const allServices = await requestClinicJson<ServiceDto[]>(
        `/api/backend/clinic/services${serviceQuery}`
      );
      setServices(Array.isArray(allServices) ? allServices : []);

      if (meData.userUuid) {
        const hs = await requestClinicJson<ClientTherapistHandshakeDto[]>(
          `/api/backend/clinic/handshakes/therapist/${encodeURIComponent(meData.userUuid)}`
        );
        setHandshakes(Array.isArray(hs) ? hs : []);
      }
      setError(null);
    } catch (err) {
      setError(toProblemDetail(err));
    }
  }, []);

  useEffect(() => {
    void loadClinicData();
  }, [loadClinicData]);

  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedNotice(false);
    try {
      DomainGuard.requireNotBlank(organisationName, "Organisation name", "organisationName");
      DomainGuard.check(
        isValidDanishCvr(cvrNumber),
        "CVR number must be exactly 8 Danish digits",
        ErrorCode.VALIDATION_FAILED,
        "cvrNumber"
      );
      await requestClinicJson("/api/backend/clinic/therapist-onboarding", {
        method: "POST",
        body: JSON.stringify({
          userUuid: me?.userUuid,
          organisationName: organisationName.trim(),
          cvrNumber: cvrNumber.trim(),
          displayName: displayName.trim(),
          iban: iban.trim(),
          currency: currency.trim(),
          address: address.trim(),
          postalCode: postalCode.trim(),
          phoneNumber: phoneNumber.trim(),
          workingHoursJson: workingHoursJson.trim(),
        }),
      });
      await loadClinicData();
      setSavedNotice(true);
      await onOnboardingSuccess?.();
      window.dispatchEvent(new CustomEvent("edujournal:me-refresh"));
    } catch (err) {
      setError(toProblemDetail(err));
    }
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      DomainGuard.requireNotBlank(serviceName, "Service name", "name");
      await requestClinicJson("/api/backend/clinic/services", {
        method: "POST",
        body: JSON.stringify({
          name: serviceName.trim(),
          price: Number(servicePrice),
          durationMinutes: Number(serviceDuration),
          location: serviceLocation.trim(),
          currency,
        }),
      });
      setServiceName("");
      setServicePrice("850");
      setServiceDuration("60");
      await loadClinicData();
      window.dispatchEvent(new CustomEvent("edujournal:me-refresh"));
    } catch (err) {
      setError(toProblemDetail(err));
    }
  };

  const handleToggleService = async (id: string) => {
    try {
      await requestClinicJson(
        `/api/backend/clinic/services/${encodeURIComponent(id)}/toggle`,
        { method: "PATCH" }
      );
      await loadClinicData();
      window.dispatchEvent(new CustomEvent("edujournal:me-refresh"));
    } catch (err) {
      setError(toProblemDetail(err));
    }
  };

  const handleDeleteService = async (id: string) => {
    try {
      await requestClinicJson(
        `/api/backend/clinic/services/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      await loadClinicData();
      window.dispatchEvent(new CustomEvent("edujournal:me-refresh"));
    } catch (err) {
      setError(toProblemDetail(err));
    }
  };

  const handleUpdateHandshake = async (id: string, status: "ACTIVE" | "TERMINATED") => {
    try {
      await requestClinicJson(
        `/api/backend/clinic/handshakes/${encodeURIComponent(id)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }
      );
      await loadClinicData();
      window.dispatchEvent(new CustomEvent("edujournal:me-refresh"));
    } catch (err) {
      setError(toProblemDetail(err));
    }
  };

  const uniqueServices = deduplicateClinicServices(services);
  const totalServicePages = Math.max(1, Math.ceil(uniqueServices.length / CLINIC_PAGE_SIZE));
  const safeServicePage = Math.min(servicesPage, totalServicePages);
  const pagedServices = uniqueServices.slice(
    (safeServicePage - 1) * CLINIC_PAGE_SIZE,
    safeServicePage * CLINIC_PAGE_SIZE
  );

  return (
    <div className="space-y-6" data-testid="therapist-onboarding-view">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
          <i className="bi bi-building" aria-hidden="true" />
          {copy.onboardingBadge}
        </span>
        <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">
          {copy.onboardingHeading}
        </h2>
      </div>

      <ProblemAlert error={error} onDismiss={() => setError(null)} />

      {me?.missingProfileFields && me.missingProfileFields.length > 0 && (
        <div
          data-testid="onboarding-missing-fields"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900"
        >
          {copy.missingBeforePublishPrefix}:{" "}
          {me.missingProfileFields
            .map((field) => localizeMissingField(field, locale))
            .join(", ")}
        </div>
      )}

      {savedNotice && (
        <div
          data-testid="onboarding-saved-badge"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800"
        >
          {copy.onboardingSavedBanner}
        </div>
      )}

      <form
        noValidate
        onSubmit={handleOnboardSubmit}
        data-testid="therapist-onboarding-form"
        className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-3"
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="onboard-orgName"
            className="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            {copy.onboardOrgPlaceholder}
          </label>
          <input
            id="onboard-orgName"
            data-testid="input-onboard-orgName"
            placeholder={copy.onboardOrgPlaceholder}
            value={organisationName}
            onChange={(e) => setOrganisationName(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="onboard-cvr"
            className="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            {copy.onboardCvrPlaceholder}
          </label>
          <input
            id="onboard-cvr"
            data-testid="input-onboard-cvr"
            placeholder={copy.onboardCvrPlaceholder}
            value={cvrNumber}
            onChange={(e) => setCvrNumber(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="onboard-displayName"
            className="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            {copy.onboardDisplayNamePlaceholder}
          </label>
          <input
            id="onboard-displayName"
            data-testid="input-onboard-displayName"
            placeholder={copy.onboardDisplayNamePlaceholder}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="onboard-iban"
            className="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            {copy.onboardIbanPlaceholder}
          </label>
          <input
            id="onboard-iban"
            data-testid="input-onboard-iban"
            placeholder={copy.onboardIbanPlaceholder}
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="onboard-currency"
            className="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            {copy.currencyLabel}
          </label>
          <select
            id="onboard-currency"
            data-testid="input-onboard-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          >
            <option value="DKK">DKK</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="onboard-hours"
            className="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            {copy.onboardHoursPlaceholder}
          </label>
          <input
            id="onboard-hours"
            data-testid="input-onboard-hours"
            placeholder={copy.onboardHoursPlaceholder}
            value={workingHoursJson}
            onChange={(e) => setWorkingHoursJson(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="onboard-address"
            className="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            {copy.onboardAddressPlaceholder}
          </label>
          <input
            id="onboard-address"
            data-testid="input-onboard-address"
            placeholder={copy.onboardAddressPlaceholder}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="onboard-postalCode"
            className="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            {copy.onboardPostalPlaceholder}
          </label>
          <input
            id="onboard-postalCode"
            data-testid="input-onboard-postalCode"
            placeholder={copy.onboardPostalPlaceholder}
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="onboard-phone"
            className="text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            {copy.onboardPhonePlaceholder}
          </label>
          <input
            id="onboard-phone"
            data-testid="input-onboard-phone"
            placeholder={copy.onboardPhonePlaceholder}
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </div>
        <div className="sm:col-span-3 flex justify-end pt-1">
          <button
            type="submit"
            data-testid="submit-therapist-onboarding"
            className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            {copy.saveOnboardingBtn}
          </button>
        </div>
      </form>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" data-testid="therapist-services-card">
        <h3 className="text-sm font-semibold text-slate-900">{copy.servicesHeading}</h3>
        <form
          noValidate
          onSubmit={handleCreateService}
          data-testid="therapist-service-form"
          className="grid grid-cols-1 gap-2 sm:grid-cols-5 items-end"
        >
          <div className="flex flex-col gap-1">
            <label
              htmlFor="service-name"
              className="text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              {copy.serviceNamePlaceholder}
            </label>
            <input
              id="service-name"
              data-testid="input-service-name"
              placeholder={copy.serviceNamePlaceholder}
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="service-price"
              className="text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              {copy.servicePricePlaceholder}
            </label>
            <input
              id="service-price"
              data-testid="input-service-price"
              type="number"
              placeholder={copy.servicePricePlaceholder}
              value={servicePrice}
              onChange={(e) => setServicePrice(e.target.value)}
              className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="service-duration"
              className="text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              {copy.serviceDurationPlaceholder}
            </label>
            <input
              id="service-duration"
              data-testid="input-service-duration"
              type="number"
              placeholder={copy.serviceDurationPlaceholder}
              value={serviceDuration}
              onChange={(e) => setServiceDuration(e.target.value)}
              className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="service-location"
              className="text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              {copy.serviceLocationPlaceholder}
            </label>
            <input
              id="service-location"
              data-testid="input-service-location"
              placeholder={copy.serviceLocationPlaceholder}
              value={serviceLocation}
              onChange={(e) => setServiceLocation(e.target.value)}
              className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            data-testid="submit-clinic-service"
            className="min-h-11 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            {copy.addServiceBtn}
          </button>
        </form>

        <ul className="space-y-2" data-testid="therapist-services-list">
          {pagedServices.map((srv) => (
            <li
              key={srv.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
            >
              <span>
                <strong>{srv.name}</strong> — {srv.price ?? srv.priceDkk} {srv.currency || "DKK"} ({srv.durationMinutes} min){" "}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                  {srv.isActive ? copy.serviceActiveLabel : copy.serviceInactiveLabel}
                </span>
              </span>
              {srv.id && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    data-testid={`toggle-service-${srv.id}`}
                    onClick={() => void handleToggleService(srv.id!)}
                    className="min-h-11 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    {copy.toggleServiceStatusBtn}
                  </button>
                  <button
                    type="button"
                    data-testid={`delete-service-${srv.id}`}
                    onClick={() => setPendingAction({ kind: "delete-service", id: srv.id! })}
                    className="min-h-11 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
                  >
                    {copy.deleteBtn}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {uniqueServices.length > CLINIC_PAGE_SIZE && (
          <div
            className="flex items-center justify-between gap-2 pt-2"
            data-testid="services-pagination"
          >
            <button
              type="button"
              disabled={safeServicePage <= 1}
              data-testid="services-prev"
              onClick={() => setServicesPage(Math.max(1, safeServicePage - 1))}
              className="min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {copy.prevPageBtn}
            </button>
            <span className="text-xs font-medium text-slate-600">
              {copy.pageLabel} {safeServicePage} {copy.ofLabel} {totalServicePages}
            </span>
            <button
              type="button"
              disabled={safeServicePage >= totalServicePages}
              data-testid="services-next"
              onClick={() => setServicesPage(Math.min(totalServicePages, safeServicePage + 1))}
              className="min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {copy.nextPageBtn}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4" data-testid="therapist-handshakes-card">
        <h3 className="text-sm font-semibold text-slate-900">{copy.therapistHandshakesHeading}</h3>
        <ul className="space-y-2" data-testid="therapist-handshakes-list">
          {handshakes.map((hs) => (
            <li
              key={hs.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
            >
              <span>
                <strong>{hs.clientName || hs.clientUuid}</strong> —{" "}
                {localizeHandshakeStatus(hs.status, locale)}
              </span>
              {hs.id && (
                <div className="flex gap-2">
                  {hs.status !== "ACTIVE" && (
                    <button
                      type="button"
                      data-testid={`approve-handshake-${hs.id}`}
                      onClick={() => void handleUpdateHandshake(hs.id!, "ACTIVE")}
                      className="min-h-11 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      {copy.approveBtn}
                    </button>
                  )}
                  {hs.status !== "TERMINATED" && (
                    <button
                      type="button"
                      data-testid={`terminate-handshake-${hs.id}`}
                      onClick={() =>
                        setPendingAction({ kind: "terminate-handshake", id: hs.id! })
                      }
                      className="min-h-11 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
                    >
                      {copy.terminateBtn}
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <ConfirmActionDialog
        open={Boolean(pendingAction)}
        title={
          pendingAction?.kind === "delete-service"
            ? copy.confirmDeleteServiceTitle
            : copy.confirmTerminateTitle
        }
        description={
          pendingAction?.kind === "delete-service"
            ? copy.confirmDeleteServiceDesc
            : copy.confirmTerminateDesc
        }
        confirmLabel={
          pendingAction?.kind === "delete-service"
            ? copy.deleteBtn
            : copy.terminateBtn
        }
        cancelLabel={copy.cancelBtn}
        tone="danger"
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          const action = pendingAction;
          setPendingAction(null);
          if (!action) {
            return;
          }
          if (action.kind === "delete-service") {
            void handleDeleteService(action.id);
          } else {
            void handleUpdateHandshake(action.id, "TERMINATED");
          }
        }}
      />
    </div>
  );
};

export const ProfileSettingsWorkspace: React.FC = () => {
  const auth = useOptionalAuth();
  const locale = useUiLocale();
  const copy = CLINIC_INNER_COPY[locale];
  const isProviderOrAdmin = Boolean(auth?.hasRole("PROVIDER", "MANAGEMENT"));
  return (
    <div className="space-y-6" data-testid="profile-settings-workspace">
      <ClientConsentAndProfileView />
      {isProviderOrAdmin && (
        <section
          data-testid="settings-clinic-shortcut-card"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-wrap items-center justify-between gap-4"
        >
          <div className="space-y-1.5 max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
              <i className="bi bi-building" aria-hidden="true" />
              {copy.onboardingBadge}
            </span>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              {copy.onboardingHeading}
            </h2>
            <p className="text-sm text-slate-600">
              {copy.settingsClinicShortcutDesc}
            </p>
          </div>
          <a
            href={`/${locale}/dashboard/clinic`}
            data-testid="settings-open-clinic-cvr-link"
            className="min-h-11 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-800"
          >
            <i className="bi bi-arrow-right-circle" aria-hidden="true" />
            {copy.settingsOpenClinicBtn}
          </a>
        </section>
      )}
    </div>
  );
};

export default ClinicPlatformFeatureView;

