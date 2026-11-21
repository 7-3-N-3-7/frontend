"use client";

/**
 * ============================================================================
 * ARKITEKTONISK VISITKORT: LandingFeature.tsx (Offentlig Zero-Trust Slice)
 * ============================================================================
 * @Spejler: frontend/src/core/authGateway.ts (Port 5173 `apps/landing`)
 *
 * FORMÅL (Til Censor, Vejleder & Nykommende Udviklere):
 * Denne komponent udgør den offentlige indgang til platformen og overholder
 * streng fysisk Separation of Concerns (SoC): den importerer INGEN
 * [AbstractClass: BaseApiService], INGEN patient- eller klinik-DTO'er og INGEN
 * dashboard-komponenter. Den kalder udelukkende `AuthGateway#initiateLogin(roleHint)`
 * for at sende brugeren sikkert videre til OIDC/Dashboard (Port 5174).
 * ============================================================================
 */

import React from "react";
import { AuthGateway, GatewayRoleHint } from "../../core/authGateway";

export interface LandingFeatureViewProps {
  onNavigate?: (url: string) => void;
}

/**
 * Public Landing Gateway Slice (Zero-Trust boundary).
 * Contains zero business logic, zero sensitive DTOs, and zero dashboard CRUD dependencies.
 */
export const LandingFeatureView: React.FC<LandingFeatureViewProps> = ({
  onNavigate,
}) => {
  const triggerLogin = (roleHint?: GatewayRoleHint) => {
    AuthGateway.initiateLogin(roleHint, onNavigate);
  };

  return (
    <main
      data-testid="landing-feature-view"
      className="min-h-screen flex flex-col bg-slate-50 text-slate-900"
    >
      <header className="w-full border-b border-slate-200/70 bg-white/90 backdrop-blur-xs">
        <div className="flex flex-wrap justify-between items-center gap-3 p-4 sm:p-6 max-w-6xl mx-auto w-full">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-white">
              <i className="bi bi-heart-pulse text-base" aria-hidden="true" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight m-0">Integr8te Platform</h1>
          </div>
          <button
            type="button"
            data-testid="landing-login-btn"
            onClick={() => triggerLogin()}
            className="min-h-11 inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-md font-medium hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <i className="bi bi-box-arrow-in-right" aria-hidden="true" />
            Log ind på Portal
          </button>
        </div>
      </header>

      <section className="flex-1 flex flex-col justify-center max-w-4xl mx-auto text-center py-10 sm:py-16 px-4 sm:px-6">
        <h2 className="text-3xl sm:text-5xl font-extrabold mb-6">
          Sikker journalføring, booking og klinikstyring samlet ét sted
        </h2>
        <p className="text-base sm:text-lg text-slate-600 mb-10">
          En rollebaseret platform til klienter, terapeuter og virksomhedsledelse
          med fuld sporbarhed.
        </p>
        <div className="flex flex-wrap gap-3 sm:gap-4 justify-center">
          <button
            type="button"
            data-testid="landing-client-login-btn"
            onClick={() => triggerLogin("CLIENT")}
            className="min-h-11 w-full sm:w-auto justify-center inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <i className="bi bi-person" aria-hidden="true" />
            Klient Login
          </button>
          <button
            type="button"
            data-testid="landing-provider-login-btn"
            onClick={() => triggerLogin("PROVIDER")}
            className="min-h-11 w-full sm:w-auto justify-center inline-flex items-center gap-2 px-6 py-3 border border-slate-300 bg-white rounded-md font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <i className="bi bi-clipboard2-pulse" aria-hidden="true" />
            Terapeut / Ledelse Login
          </button>
          <button
            type="button"
            data-testid="landing-management-login-btn"
            onClick={() => triggerLogin("MANAGEMENT")}
            className="min-h-11 w-full sm:w-auto justify-center inline-flex items-center gap-2 px-6 py-3 border border-slate-300 bg-white rounded-md font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <i className="bi bi-graph-up-arrow" aria-hidden="true" />
            Virksomhedsledelse Login
          </button>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500">
        EduJournal / Integr8te Platform — Zero-Trust OIDC Indgang
      </footer>
    </main>
  );
};

export default LandingFeatureView;
