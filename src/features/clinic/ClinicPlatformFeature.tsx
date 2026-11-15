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
import { JournalFeatureView } from "../journal/JournalFeature";
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
}

const CLINIC_INNER_COPY: Record<SupportedUiLocale, ClinicInnerCopy> = {
  da: {
    clientsBadge: "Klientregister",
    clientsHeading: "Klinikplatform — Klientprofiler & Handshakes",
    profilesCountSuffix: "profiler",
    nameLabel: "Navn",
    namePlaceholder: "Klientens fulde navn",
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
    activeHandshakesHeading: "Aktive Behandlersamtykker (Handshakes)",
    emptyConsents:
      "Du har ingen behandlerrelationer endnu. Find en klinik under Klinik & Praksis.",
    revokeConsentBtn: "Tilbagekald samtykke",
    onboardingBadge: "Klinik, CVR & Ydelser",
    onboardingHeading: "Klinik-Onboarding, CVR/IBAN & Behandlerhandshakes",
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
    therapistHandshakesHeading: "Klient-Handshakes",
    approveBtn: "Godkend",
    terminateBtn: "Afslut",
  },
  en: {
    clientsBadge: "Client Registry",
    clientsHeading: "Clinic Platform — Client Profiles & Handshakes",
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
    activeHandshakesHeading: "Active Therapist Consents (Handshakes)",
    emptyConsents:
      "You have no therapist connections yet. Find a clinic under Clinics & Practice.",
    revokeConsentBtn: "Revoke consent",
    onboardingBadge: "Clinic, Registry & Services",
    onboardingHeading: "Clinic Onboarding, Registry/IBAN & Client Handshakes",
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
    therapistHandshakesHeading: "Client Handshakes",
    approveBtn: "Approve",
    terminateBtn: "Terminate",
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
    activeHandshakesHeading: "Consentements Praticiens Actifs (Accords)",
    emptyConsents:
      "Vous n'avez aucune relation praticien pour le moment. Trouvez un cabinet dans Cliniques & Cabinets.",
    revokeConsentBtn: "Révoquer le consentement",
    onboardingBadge: "Clinique, Registre & Prestations",
    onboardingHeading: "Inscription Clinique, Registre/IBAN & Accords Clients",
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
    activeHandshakesHeading: "Consentimientos Activos con Terapeutas (Acuerdos)",
    emptyConsents:
      "Aún no tienes relaciones con terapeutas. Encuentra una clínica en Clínicas & Práctica.",
    revokeConsentBtn: "Revocar consentimiento",
    onboardingBadge: "Clínica, Registro y Servicios",
    onboardingHeading: "Alta de Clínica, Registro/IBAN y Acuerdos de Clientes",
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
    activeHandshakesHeading: "Aktive Therapeuten-Einwilligungen (Freigaben)",
    emptyConsents:
      "Sie haben noch keine Therapeutenbeziehungen. Finden Sie eine Praxis unter Klinik & Praxis.",
    revokeConsentBtn: "Einwilligung widerrufen",
    onboardingBadge: "Klinik, Register & Leistungen",
    onboardingHeading: "Klinik-Onboarding, Register/IBAN & Klientenfreigaben",
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
  },
};

export const ClinicPlatformFeatureView: React.FC = () => {
  const { items, loading, error, create, remove, clearError } =
    useBaseCrud(clinicPlatformApi);
  const locale = useUiLocale();
  const copy = CLINIC_INNER_COPY[locale];
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

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
          {items.length} {copy.profilesCountSuffix}
        </span>
      </div>

      <ProblemAlert error={error} onDismiss={clearError} />

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {copy.nameLabel}
          </label>
          <input
            type="text"
            placeholder={copy.namePlaceholder}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            data-testid="input-client-fullName"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {copy.emailLabel}
          </label>
          <input
            type="email"
            placeholder={copy.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            data-testid="input-client-email"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {copy.phoneLabel}
          </label>
          <input
            type="text"
            placeholder={copy.phonePlaceholder}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            data-testid="input-client-phone"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
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
        {items.map((item) => (
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
              onClick={() => item.id && remove(item.id)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 px-3 py-1.5 text-xs font-semibold transition-colors"
              data-testid={`delete-clinic-client-${item.id}`}
            >
              <i className="bi bi-trash3" aria-hidden="true" />
              {copy.removeBtn}
            </button>
          </li>
        ))}
      </ul>
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
  therapistNavCalendar: string;
  therapistNavClinicCvr: string;
  therapistNavPcl5: string;
  therapistNavFinance: string;
  therapistTabOverview: string;
  therapistSubtitle: string;
  clientSettingsTitle: string;
  clientClinicTitle: string;
  clientPortalTitle: string;
  clientRoleLabel: string;
  clientNavOverview: string;
  clientNavAppointments: string;
  clientNavMarketplace: string;
  clientNavConsents: string;
  clientNavPcl5: string;
  clientNavFinance: string;
  clientSecureBadge: string;
  clientGreetingPrefix: string;
  clientSecurityCheckPrefix: string;
  clientBookSessionCta: string;
  clientCardAppointmentsTitle: string;
  clientCardAppointmentsDesc: string;
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
    adminTitle: "System & i18n Administration",
    adminRoleLabel: "Administrator",
    adminNavI18n: "Sprog & i18n",
    adminNavUsers: "Brugere & Roller",
    adminNavManagement: "KPI & Ledelse",
    adminNavClinic: "Klinik & CVR",
    therapistClinicTitle: "Klinik & CVR-Administration",
    therapistWorkspaceTitle: "Behandler-Workspace",
    therapistRoleLabel: "Behandler",
    therapistNavOverview: "Multi-Window",
    therapistNavCalendar: "Kalender",
    therapistNavClinicCvr: "CVR & Praksis",
    therapistNavPcl5: "PCL-5 Screener",
    therapistNavFinance: "Økonomi & Faktura",
    therapistTabOverview: "Klinik & Journal",
    therapistSubtitle:
      "1:1 Vertical Slice overblik over klienter, JGit-journaler, Timefold-aftaler og praksisdrift",
    clientSettingsTitle: "Profil- & Klinikindstillinger",
    clientClinicTitle: "Bliv Behandler — CVR Onboarding",
    clientPortalTitle: "Min Klientportal",
    clientRoleLabel: "Klient",
    clientNavOverview: "Overblik",
    clientNavAppointments: "Aftaler",
    clientNavMarketplace: "Klinik & Praksis",
    clientNavConsents: "Samtykke & Profil",
    clientNavPcl5: "PCL-5 Test",
    clientNavFinance: "Faktura & Betaling",
    clientSecureBadge: "Sikker Klientportal",
    clientGreetingPrefix: "Velkommen",
    clientSecurityCheckPrefix: "Sikkerhedstjek",
    clientBookSessionCta: "Book ny session",
    clientCardAppointmentsTitle: "Mine Aftaler",
    clientCardAppointmentsDesc: "Se kommende sessioner eller book en ny tid",
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
    adminTitle: "System & i18n Administration",
    adminRoleLabel: "Administrator",
    adminNavI18n: "Languages & i18n",
    adminNavUsers: "Users & Roles",
    adminNavManagement: "KPI & Management",
    adminNavClinic: "Clinic & Company",
    therapistClinicTitle: "Clinic & Company Administration",
    therapistWorkspaceTitle: "Therapist Workspace",
    therapistRoleLabel: "Therapist",
    therapistNavOverview: "Multi-Window",
    therapistNavCalendar: "Calendar",
    therapistNavClinicCvr: "Clinic & Registry",
    therapistNavPcl5: "PCL-5 Screener",
    therapistNavFinance: "Finance & Invoices",
    therapistTabOverview: "Clinic & Journal",
    therapistSubtitle:
      "1:1 Vertical Slice overview of clients, JGit clinical records, Timefold appointments, and clinic operations",
    clientSettingsTitle: "Profile & Clinic Settings",
    clientClinicTitle: "Become a Therapist — Clinic Onboarding",
    clientPortalTitle: "My Client Portal",
    clientRoleLabel: "Client",
    clientNavOverview: "Overview",
    clientNavAppointments: "Appointments",
    clientNavMarketplace: "Clinics & Practice",
    clientNavConsents: "Consents & Profile",
    clientNavPcl5: "PCL-5 Assessment",
    clientNavFinance: "Billing & Invoices",
    clientSecureBadge: "Secure Client Portal",
    clientGreetingPrefix: "Welcome",
    clientSecurityCheckPrefix: "Security check",
    clientBookSessionCta: "Book new session",
    clientCardAppointmentsTitle: "My Appointments",
    clientCardAppointmentsDesc: "View upcoming sessions or book a new slot",
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
    adminTitle: "Administration Système & i18n",
    adminRoleLabel: "Administrateur",
    adminNavI18n: "Langues & i18n",
    adminNavUsers: "Utilisateurs & Rôles",
    adminNavManagement: "KPI & Gestion",
    adminNavClinic: "Clinique & Registre",
    therapistClinicTitle: "Administration Clinique & Registre",
    therapistWorkspaceTitle: "Espace Praticien",
    therapistRoleLabel: "Praticien",
    therapistNavOverview: "Multi-Fenêtre",
    therapistNavCalendar: "Calendrier",
    therapistNavClinicCvr: "Clinique & Registre",
    therapistNavPcl5: "Dépistage PCL-5",
    therapistNavFinance: "Finances & Factures",
    therapistTabOverview: "Clinique & Dossier",
    therapistSubtitle:
      "Vue Vertical Slice 1:1 des clients, dossiers JGit, rendez-vous Timefold et gestion de clinique",
    clientSettingsTitle: "Paramètres Profil & Clinique",
    clientClinicTitle: "Devenir Praticien — Inscription Clinique",
    clientPortalTitle: "Mon Portail Client",
    clientRoleLabel: "Client",
    clientNavOverview: "Aperçu",
    clientNavAppointments: "Rendez-vous",
    clientNavMarketplace: "Cliniques & Cabinets",
    clientNavConsents: "Consentements & Profil",
    clientNavPcl5: "Test PCL-5",
    clientNavFinance: "Facturation & Paiements",
    clientSecureBadge: "Portail Client Sécurisé",
    clientGreetingPrefix: "Bienvenue",
    clientSecurityCheckPrefix: "Contrôle sécurité",
    clientBookSessionCta: "Réserver une séance",
    clientCardAppointmentsTitle: "Mes Rendez-vous",
    clientCardAppointmentsDesc: "Consulter les séances à venir ou réserver",
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
    adminTitle: "Administración del Sistema & i18n",
    adminRoleLabel: "Administrador",
    adminNavI18n: "Idiomas & i18n",
    adminNavUsers: "Usuarios & Roles",
    adminNavManagement: "KPI & Gestión",
    adminNavClinic: "Clínica & Registro",
    therapistClinicTitle: "Administración de Clínica & Registro",
    therapistWorkspaceTitle: "Espacio del Terapeuta",
    therapistRoleLabel: "Terapeuta",
    therapistNavOverview: "Multi-Ventana",
    therapistNavCalendar: "Calendario",
    therapistNavClinicCvr: "Clínica & Registro",
    therapistNavPcl5: "Cribado PCL-5",
    therapistNavFinance: "Finanzas & Facturas",
    therapistTabOverview: "Clínica & Historia",
    therapistSubtitle:
      "Vista Vertical Slice 1:1 de clientes, historias JGit, citas Timefold y gestión clínica",
    clientSettingsTitle: "Configuración de Perfil & Clínica",
    clientClinicTitle: "Hazte Terapeuta — Alta de Clínica",
    clientPortalTitle: "Mi Portal de Cliente",
    clientRoleLabel: "Cliente",
    clientNavOverview: "Resumen",
    clientNavAppointments: "Citas",
    clientNavMarketplace: "Clínicas & Práctica",
    clientNavConsents: "Consentimientos & Perfil",
    clientNavPcl5: "Prueba PCL-5",
    clientNavFinance: "Facturación & Pagos",
    clientSecureBadge: "Portal de Cliente Seguro",
    clientGreetingPrefix: "Bienvenido",
    clientSecurityCheckPrefix: "Control de seguridad",
    clientBookSessionCta: "Reservar nueva sesión",
    clientCardAppointmentsTitle: "Mis Citas",
    clientCardAppointmentsDesc: "Ver próximas sesiones o reservar una cita",
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
    adminTitle: "System- & i18n-Verwaltung",
    adminRoleLabel: "Administrator",
    adminNavI18n: "Sprachen & i18n",
    adminNavUsers: "Benutzer & Rollen",
    adminNavManagement: "KPI & Leitung",
    adminNavClinic: "Klinik & Register",
    therapistClinicTitle: "Klinik- & Registerverwaltung",
    therapistWorkspaceTitle: "Therapeuten-Arbeitsbereich",
    therapistRoleLabel: "Therapeut",
    therapistNavOverview: "Multi-Fenster",
    therapistNavCalendar: "Kalender",
    therapistNavClinicCvr: "Klinik & Praxis",
    therapistNavPcl5: "PCL-5 Screener",
    therapistNavFinance: "Finanzen & Rechnungen",
    therapistTabOverview: "Klinik & Akte",
    therapistSubtitle:
      "1:1 Vertical Slice Übersicht über Klienten, JGit-Akten, Timefold-Termine und Praxisbetrieb",
    clientSettingsTitle: "Profil- & Klinikeinstellungen",
    clientClinicTitle: "Therapeut werden — Klinik-Onboarding",
    clientPortalTitle: "Mein Klientenportal",
    clientRoleLabel: "Klient",
    clientNavOverview: "Übersicht",
    clientNavAppointments: "Termine",
    clientNavMarketplace: "Klinik & Praxis",
    clientNavConsents: "Einwilligung & Profil",
    clientNavPcl5: "PCL-5 Test",
    clientNavFinance: "Rechnung & Zahlung",
    clientSecureBadge: "Sicheres Klientenportal",
    clientGreetingPrefix: "Willkommen",
    clientSecurityCheckPrefix: "Sicherheitsprüfung",
    clientBookSessionCta: "Neue Sitzung buchen",
    clientCardAppointmentsTitle: "Meine Termine",
    clientCardAppointmentsDesc: "Kommende Sitzungen ansehen oder Termin buchen",
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
}: ResolvePortalShellInput): ResolvedPortalShellConfig {
  const copy = getPortalCopy(locale);
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
        active: !isSettings && currentTab === "overview",
      },
      {
        href: `${base}/admin?tab=users`,
        label: copy.adminNavUsers,
        icon: "bi-people",
        active: !isSettings && currentTab === "users",
      },
      {
        href: `${base}/admin?tab=management`,
        label: copy.adminNavManagement,
        icon: "bi-graph-up-arrow",
        active: !isSettings && currentTab === "management",
      },
      {
        href: `${base}/clinic`,
        label: copy.adminNavClinic,
        icon: "bi-building",
        active: false,
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
        href: `${base}/therapist?tab=calendar`,
        label: copy.therapistNavCalendar,
        icon: "bi-calendar3",
        active: !isClinic && !isSettings && currentTab === "calendar",
      },
      {
        href: `${base}/clinic`,
        label: copy.therapistNavClinicCvr,
        icon: "bi-building",
        active: isClinic || currentTab === "clinic_cvr",
      },
      {
        href: `${base}/therapist?tab=pcl5`,
        label: copy.therapistNavPcl5,
        icon: "bi-clipboard2-pulse",
        active: currentTab === "pcl5",
      },
      {
        href: `${base}/therapist?tab=finance`,
        label: copy.therapistNavFinance,
        icon: "bi-cash-stack",
        active: currentTab === "finance",
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
        active: !isSettings && currentTab === "overview",
      },
      {
        href: `${base}/personal?tab=appointments`,
        label: copy.clientNavAppointments,
        icon: "bi-calendar-check",
        active: !isSettings && currentTab === "appointments",
      },
      {
        href: `${base}/personal?tab=marketplace`,
        label: copy.clientNavMarketplace,
        icon: "bi-shop",
        active: currentTab === "marketplace",
      },
      {
        href: `${base}/personal?tab=consents`,
        label: copy.clientNavConsents,
        icon: "bi-shield-check",
        active: currentTab === "consents",
      },
      {
        href: `${base}/personal?tab=pcl5`,
        label: copy.clientNavPcl5,
        icon: "bi-clipboard2-pulse",
        active: currentTab === "pcl5",
      },
      {
        href: `${base}/personal?tab=finance`,
        label: copy.clientNavFinance,
        icon: "bi-receipt",
        active: currentTab === "finance",
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
    profileSubtext = `${copy.missingPrefix}: ${me.missingProfileFields.join(", ")}`;
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
    defaultSidebarCollapsed:
      activeArea === "therapist" &&
      pathname.includes("/dashboard/therapist") &&
      currentTab === "overview",
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

  useEffect(() => {
    if (initialMe !== undefined) {
      setMe(initialMe);
      return;
    }

    let cancelled = false;
    fetch("/api/backend/clinic/me", { credentials: "same-origin" })
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

  const shellConfig = useMemo(
    () =>
      resolvePortalShellConfig({
        locale: effectiveLocale,
        pathname: effectivePathname,
        tab: activeTab,
        me,
      }),
    [effectiveLocale, effectivePathname, activeTab, me]
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
  const copy = useMemo(
    () => getPortalCopy(locale ?? i18nCache?.locale ?? "da"),
    [locale, i18nCache?.locale]
  );
  const displayTherapistName = therapistName ?? copy.defaultTherapist;
  const therapistTabs: ReadonlyArray<{
    id: TherapistTab;
    label: string;
    testId: string;
  }> = [
    { id: "overview", label: copy.therapistTabOverview, testId: "tab-btn-overview" },
    { id: "calendar", label: copy.therapistNavCalendar, testId: "tab-btn-calendar" },
    { id: "clinic_cvr", label: copy.therapistNavClinicCvr, testId: "tab-btn-clinic-cvr" },
    { id: "pcl5", label: copy.therapistNavPcl5, testId: "tab-btn-pcl5" },
    { id: "finance", label: copy.therapistNavFinance, testId: "tab-btn-finance" },
  ];
  const [internalTab, setInternalTab] = useState<TherapistTab>(initialTab);

  useEffect(() => {
    setInternalTab(initialTab);
  }, [initialTab]);

  const activeTab = controlledActiveTab ?? internalTab;

  const selectTab = (next: TherapistTab) => {
    setInternalTab(next);
    onTabChange?.(next);
  };

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

        <div className="flex flex-wrap gap-1.5">
          {therapistTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              data-testid={tab.testId}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === tab.id
                  ? "bg-teal-700 text-white shadow-xs"
                  : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs xl:col-span-12">
            <ClinicPlatformFeatureView />
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs xl:col-span-6">
            <JournalFeatureView />
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs xl:col-span-6">
            <AppointmentFeatureView />
          </div>
        </div>
      )}

      {activeTab === "calendar" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="therapist-calendar-panel"
        >
          <AppointmentFeatureView />
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
          <PsychotraumatologyFeatureView />
        </section>
      )}

      {activeTab === "finance" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="therapist-finance-panel"
        >
          <FinanceFeatureView onRoleUpgraded={onRoleUpgraded} />
        </section>
      )}
    </div>
  );
};

export type ClientTab =
  | "overview"
  | "appointments"
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
 * markedsplads, samtykke, PCL-5 screening og fakturaer i en moderne Nordic HealthTech-skal.
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
  const clientTabs: ReadonlyArray<{
    id: ClientTab;
    label: string;
    icon: string;
  }> = [
    { id: "overview", label: copy.clientNavOverview, icon: "bi-grid-1x2" },
    { id: "appointments", label: copy.clientNavAppointments, icon: "bi-calendar-check" },
    { id: "marketplace", label: copy.clientNavMarketplace, icon: "bi-shop" },
    { id: "consents", label: copy.clientNavConsents, icon: "bi-shield-check" },
    { id: "pcl5", label: copy.clientNavPcl5, icon: "bi-clipboard2-pulse" },
    { id: "finance", label: copy.clientNavFinance, icon: "bi-receipt" },
  ];
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
            {secureStatus && (
              <p
                className="mt-1 mb-0 text-xs font-medium text-emerald-700"
                data-testid="client-secure-status"
              >
                {copy.clientSecurityCheckPrefix}: {secureStatus}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => selectTab("appointments")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-800"
            >
              <i className="bi bi-calendar-plus" aria-hidden="true" />
              {copy.clientBookSessionCta}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
          {clientTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              data-testid={`client-tab-${tab.id}`}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === tab.id
                  ? "bg-teal-50 text-teal-800 border border-teal-200 shadow-xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <i className={`bi ${tab.icon}`} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </header>

      {activeTab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <button
              type="button"
              onClick={() => selectTab("appointments")}
              className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-xs transition-colors hover:border-teal-300 hover:bg-teal-50/30"
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
              onClick={() => selectTab("consents")}
              className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-xs transition-colors hover:border-teal-300 hover:bg-teal-50/30"
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
              className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-xs transition-colors hover:border-teal-300 hover:bg-teal-50/30"
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
            <BookingFeatureView />
          </section>
        </div>
      )}

      {activeTab === "appointments" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="client-appointments-panel"
        >
          <BookingFeatureView />
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
          <PsychotraumatologyFeatureView />
        </section>
      )}

      {activeTab === "finance" && (
        <section
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"
          data-testid="client-finance-panel"
        >
          <FinanceFeatureView onRoleUpgraded={onRoleUpgraded} />
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

  const visibleProviders = providers.filter(
    (p) => !clientUuid || p.userUuid !== clientUuid
  );

  return (
    <div className="space-y-5" data-testid="client-marketplace-view">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
          <i className="bi bi-shop" aria-hidden="true" />
          {copy.marketplaceBadge}
        </span>
        <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">
          {copy.marketplaceHeading}
        </h2>
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="marketplace-provider-list">
          {visibleProviders.map((provider) => {
            const pUuid = provider.userUuid || "";
            const providerServices = services.filter(
              (s) => s.provider?.id === provider.id
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
                        {activeHandshake.status}
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
                            {srv.price} {srv.currency}
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
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                  >
                    {copy.requestCourseBtn}
                  </button>
                )}
              </div>
            );
          })}
        </div>
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

  const handleRevokeHandshake = async (handshakeId: string) => {
    try {
      await requestClinicJson(
        `/api/backend/clinic/handshakes/${encodeURIComponent(handshakeId)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "REVOKED" }),
        }
      );
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

      <form
        onSubmit={handleSaveProfile}
        data-testid="personal-profile-form"
        className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
      >
        <input
          data-testid="input-profile-fullName"
          placeholder={copy.profileFullNamePlaceholder}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <input
          data-testid="input-profile-email"
          type="email"
          placeholder={copy.profileEmailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <input
          data-testid="input-profile-phone"
          placeholder={copy.profilePhonePlaceholder}
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <input
          data-testid="input-profile-dob"
          placeholder={copy.profileDobPlaceholder}
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <input
          data-testid="input-profile-address"
          placeholder={copy.profileAddressPlaceholder}
          value={homeAddress}
          onChange={(e) => setHomeAddress(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <input
          data-testid="input-profile-postalCode"
          placeholder={copy.profilePostalCodePlaceholder}
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <div className="sm:col-span-2 flex justify-end">
          <button
            type="submit"
            data-testid="submit-personal-profile"
            className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
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
          <ul className="space-y-2" data-testid="client-handshakes-consent-list">
            {handshakes.map((hs) => (
              <li
                key={hs.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
              >
                <div>
                  <strong>{hs.therapistName || hs.organisationName}</strong> —{' '}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {hs.status}
                  </span>
                </div>
                {hs.id && hs.status !== "REVOKED" && hs.status !== "TERMINATED" && (
                  <button
                    type="button"
                    data-testid={`revoke-handshake-${hs.id}`}
                    onClick={() => void handleRevokeHandshake(hs.id!)}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    {copy.revokeConsentBtn}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
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
  const [servicePrice, setServicePrice] = useState("1200");
  const [serviceDuration, setServiceDuration] = useState("60");
  const [serviceLocation, setServiceLocation] = useState("Klinik");
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [handshakes, setHandshakes] = useState<ClientTherapistHandshakeDto[]>([]);
  const [savedNotice, setSavedNotice] = useState(false);
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

      const allServices = await requestClinicJson<ServiceDto[]>("/api/backend/clinic/services");
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
      await loadClinicData();
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
    } catch (err) {
      setError(toProblemDetail(err));
    }
  };

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
          {copy.missingBeforePublishPrefix}: {me.missingProfileFields.join(", ")}
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
        onSubmit={handleOnboardSubmit}
        data-testid="therapist-onboarding-form"
        className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-3"
      >
        <input
          data-testid="input-onboard-orgName"
          placeholder={copy.onboardOrgPlaceholder}
          value={organisationName}
          onChange={(e) => setOrganisationName(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <input
          data-testid="input-onboard-cvr"
          placeholder={copy.onboardCvrPlaceholder}
          value={cvrNumber}
          onChange={(e) => setCvrNumber(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <input
          data-testid="input-onboard-displayName"
          placeholder={copy.onboardDisplayNamePlaceholder}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <input
          data-testid="input-onboard-iban"
          placeholder={copy.onboardIbanPlaceholder}
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <select
          data-testid="input-onboard-currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        >
          <option value="DKK">DKK</option>
          <option value="EUR">EUR</option>
        </select>
        <input
          data-testid="input-onboard-hours"
          placeholder={copy.onboardHoursPlaceholder}
          value={workingHoursJson}
          onChange={(e) => setWorkingHoursJson(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <input
          data-testid="input-onboard-address"
          placeholder={copy.onboardAddressPlaceholder}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <input
          data-testid="input-onboard-postalCode"
          placeholder={copy.onboardPostalPlaceholder}
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <input
          data-testid="input-onboard-phone"
          placeholder={copy.onboardPhonePlaceholder}
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        />
        <div className="sm:col-span-3 flex justify-end">
          <button
            type="submit"
            data-testid="submit-therapist-onboarding"
            className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            {copy.saveOnboardingBtn}
          </button>
        </div>
      </form>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" data-testid="therapist-services-card">
        <h3 className="text-sm font-semibold text-slate-900">{copy.servicesHeading}</h3>
        <form onSubmit={handleCreateService} data-testid="therapist-service-form" className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          <input
            data-testid="input-service-name"
            placeholder={copy.serviceNamePlaceholder}
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            data-testid="input-service-price"
            type="number"
            placeholder={copy.servicePricePlaceholder}
            value={servicePrice}
            onChange={(e) => setServicePrice(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            data-testid="input-service-duration"
            type="number"
            placeholder={copy.serviceDurationPlaceholder}
            value={serviceDuration}
            onChange={(e) => setServiceDuration(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            data-testid="input-service-location"
            placeholder={copy.serviceLocationPlaceholder}
            value={serviceLocation}
            onChange={(e) => setServiceLocation(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            data-testid="submit-clinic-service"
            className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            {copy.addServiceBtn}
          </button>
        </form>

        <ul className="space-y-2" data-testid="therapist-services-list">
          {services.map((srv) => (
            <li
              key={srv.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
            >
              <span>
                <strong>{srv.name}</strong> — {srv.price} {srv.currency} ({srv.durationMinutes} min){" "}
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
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700"
                  >
                    {copy.toggleServiceStatusBtn}
                  </button>
                  <button
                    type="button"
                    data-testid={`delete-service-${srv.id}`}
                    onClick={() => void handleDeleteService(srv.id!)}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"
                  >
                    {copy.deleteBtn}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
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
                <strong>{hs.clientName || hs.clientUuid}</strong> — {hs.status}
              </span>
              {hs.id && (
                <div className="flex gap-2">
                  {hs.status !== "ACTIVE" && (
                    <button
                      type="button"
                      data-testid={`approve-handshake-${hs.id}`}
                      onClick={() => void handleUpdateHandshake(hs.id!, "ACTIVE")}
                      className="rounded-lg bg-teal-700 px-2.5 py-1 text-xs font-semibold text-white"
                    >
                      {copy.approveBtn}
                    </button>
                  )}
                  {hs.status !== "TERMINATED" && (
                    <button
                      type="button"
                      data-testid={`terminate-handshake-${hs.id}`}
                      onClick={() => void handleUpdateHandshake(hs.id!, "TERMINATED")}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"
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
    </div>
  );
};

export const ProfileSettingsWorkspace: React.FC = () => {
  const auth = useOptionalAuth();
  const isProviderOrAdmin = Boolean(auth?.hasRole("PROVIDER", "MANAGEMENT"));
  return (
    <div className="space-y-6" data-testid="profile-settings-workspace">
      <ClientConsentAndProfileView />
      {isProviderOrAdmin && <TherapistClinicOnboardingView />}
    </div>
  );
};

export default ClinicPlatformFeatureView;

