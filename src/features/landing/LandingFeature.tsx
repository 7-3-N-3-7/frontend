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
      className="min-h-screen flex flex-col justify-between bg-slate-50 text-slate-900"
    >
      <header className="flex flex-wrap justify-between items-center gap-3 p-4 sm:p-6 max-w-6xl mx-auto w-full">
        <h1 className="text-2xl font-bold tracking-tight">Integr8te Platform</h1>
        <button
          type="button"
          data-testid="landing-login-btn"
          onClick={() => triggerLogin()}
          className="min-h-11 px-5 py-2.5 bg-slate-900 text-white rounded-md font-medium hover:bg-slate-800"
        >
          Log ind på Portal
        </button>
      </header>

      <section className="max-w-4xl mx-auto text-center py-12 sm:py-24 px-4 sm:px-6">
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
            className="min-h-11 px-6 py-3 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700"
          >
            Klient Login
          </button>
          <button
            type="button"
            data-testid="landing-provider-login-btn"
            onClick={() => triggerLogin("PROVIDER")}
            className="min-h-11 px-6 py-3 border border-slate-300 bg-white rounded-md font-semibold hover:bg-slate-50"
          >
            Terapeut / Ledelse Login
          </button>
          <button
            type="button"
            data-testid="landing-management-login-btn"
            onClick={() => triggerLogin("MANAGEMENT")}
            className="min-h-11 px-6 py-3 border border-slate-300 bg-white rounded-md font-semibold hover:bg-slate-50"
          >
            Virksomhedsledelse Login
          </button>
        </div>
      </section>
    </main>
  );
};

export default LandingFeatureView;
