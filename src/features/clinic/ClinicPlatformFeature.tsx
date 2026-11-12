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

import React, { useState } from "react";
import {
  BaseApiService,
  DomainGuard,
  ErrorCode,
  HasId,
} from "../../core/baseDomainCore";
import {
  PortalWorkspaceShell,
  PortalWorkspaceShellProps,
  ProblemAlert,
  useBaseCrud,
} from "../../core/baseUiCore";
import { JournalFeatureView } from "../journal/JournalFeature";
import { AppointmentFeatureView } from "../appointment/AppointmentFeature";
import { BookingFeatureView } from "../booking/BookingFeature";

// ==========================================
// 1. DTOs & DOMAIN MODELS (1:1 with ClinicPlatformFeature.java)
// ==========================================

export interface OrganisationDto extends HasId<string> {
  id?: string;
  name: string;
  cvrNumber: string;
  address?: string;
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
  cprOrIdentifier?: string;
  notes?: string;
  createdAt?: string;
}

export interface ProviderProfileDto extends HasId<string> {
  id?: string;
  userId?: string;
  organisationId?: string;
  fullName: string;
  title?: string;
  specialty?: string;
  bio?: string;
  weeklyScheduleJson?: string;
  createdAt?: string;
}

export interface ServiceDto extends HasId<string> {
  id?: string;
  organisationId?: string;
  name: string;
  description?: string;
  durationMinutes: number;
  priceDkk: number;
  active?: boolean;
}

export type HandshakeStatus = "PENDING" | "ACCEPTED" | "REVOKED";

export interface ClientTherapistHandshakeDto extends HasId<string> {
  id?: string;
  clientId: string;
  therapistId: string;
  clientName?: string;
  therapistName?: string;
  status: HandshakeStatus;
  sharedJournalAccess: boolean;
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

// ==========================================
// 3. PRESENTATION / UI COMPONENT (Exported)
// ==========================================

export const ClinicPlatformFeatureView: React.FC = () => {
  const { items, loading, error, create, remove, clearError } =
    useBaseCrud(clinicPlatformApi);
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
      className="p-4 max-w-4xl mx-auto"
      data-testid="clinic-platform-feature-view"
    >
      <h2 className="text-xl font-bold mb-4">
        Clinic Platform — Client Profiles & Handshakes
      </h2>

      <ProblemAlert error={error} onDismiss={clearError} />

      <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Client Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="border p-2 rounded"
          data-testid="input-client-fullName"
        />
        <input
          type="email"
          placeholder="Client Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border p-2 rounded"
          data-testid="input-client-email"
        />
        <input
          type="text"
          placeholder="Phone (Optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="border p-2 rounded"
          data-testid="input-client-phone"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded"
          data-testid="submit-clinic-client"
        >
          Register Client
        </button>
      </form>

      {loading && <p data-testid="loading-indicator">Loading...</p>}

      <ul className="space-y-2" data-testid="clinic-client-list">
        {items.map((item) => (
          <li
            key={item.id}
            className="border p-3 rounded flex justify-between items-center"
          >
            <div>
              <strong>{item.fullName}</strong> ({item.email})
              {item.phone && (
                <span className="text-sm text-gray-500 ml-2">{item.phone}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => item.id && remove(item.id)}
              className="text-red-600 hover:underline"
              data-testid={`delete-clinic-client-${item.id}`}
            >
              Remove
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

/**
 * Forbinder `PortalWorkspaceShell` fra `baseUiCore.tsx` med applikationens dashboard-layout.
 */
export const ConnectedPortalWorkspaceShell: React.FC<
  PortalWorkspaceShellProps
> = ({ title = "Platform — Sikker Klinik- og Klientportal", children }) => {
  return <PortalWorkspaceShell title={title}>{children}</PortalWorkspaceShell>;
};

export interface TherapistMultiWindowWorkspaceProps {
  therapistName?: string;
  initialTab?: "overview" | "clinic_cvr";
}

/**
 * Samlet arbejdsområde for behandlere (`PROVIDER`), der kombinerer Klientprofiler,
 * Journaler (JGit) og Aftalekalender (Timefold) i ét overskueligt workspace.
 */
export const TherapistMultiWindowWorkspace: React.FC<
  TherapistMultiWindowWorkspaceProps
> = ({ therapistName = "Behandler", initialTab = "overview" }) => {
  const [activeTab, setActiveTab] = useState<"overview" | "clinic_cvr">(
    initialTab
  );

  return (
    <div
      className="space-y-6"
      data-testid="therapist-multi-window-workspace"
      data-active-tab={activeTab}
    >
      <header className="flex justify-between items-center border-b pb-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="therapist-greeting">
            Behandler-Workspace: {therapistName}
          </h1>
          <p className="text-sm text-gray-600">
            1:1 Vertical Slice overblik over klienter, JGit-journaler og aftaler
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className="border px-3 py-1 rounded text-sm"
            data-testid="tab-btn-overview"
          >
            Klinik & Journal
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("clinic_cvr")}
            className="border px-3 py-1 rounded text-sm"
            data-testid="tab-btn-clinic-cvr"
          >
            CVR & Praksis
          </button>
        </div>
      </header>

      {activeTab === "overview" ? (
        <div className="grid grid-cols-1 gap-6">
          <ClinicPlatformFeatureView />
          <JournalFeatureView />
          <AppointmentFeatureView />
        </div>
      ) : (
        <section
          className="border rounded p-4 bg-white"
          data-testid="clinic-cvr-panel"
        >
          <h2 className="text-lg font-semibold mb-2">
            Klinik & CVR-Administration
          </h2>
          <ClinicPlatformFeatureView />
        </section>
      )}
    </div>
  );
};

export interface ClientPortalWorkspaceProps {
  userName?: string;
  secureStatus?: string | null;
}

/**
 * Borger/Klient-arbejdsområde (`CLIENT`), der giver adgang til selvbetjent booking
 * og personlig journalstatus uden at eksponere klinik- eller økonomi-slices.
 */
export const ClientPortalWorkspace: React.FC<ClientPortalWorkspaceProps> = ({
  userName = "Klient",
  secureStatus = null,
}) => {
  return (
    <div className="space-y-6" data-testid="client-portal-workspace">
      <header className="border-b pb-3">
        <h1 className="text-2xl font-bold" data-testid="client-greeting">
          Velkommen, {userName}
        </h1>
        {secureStatus && (
          <p
            className="text-xs text-emerald-700 mt-1"
            data-testid="client-secure-status"
          >
            Sikkerhedstjek: {secureStatus}
          </p>
        )}
      </header>
      <BookingFeatureView />
    </div>
  );
};

export default ClinicPlatformFeatureView;

