/**
 * ============================================================================
 * ARKITEKTONISK VISITKORT: authGateway.ts (Offentlig Zero-Trust AuthGateway)
 * ============================================================================
 * @Spejler: Traefik Edge Proxy / Keycloak OIDC Login Handoff
 *
 * FORMÅL (Til Censor, Vejleder & Nykommende Udviklere):
 * Implementerer fysisk Separation of Concerns (SoC) mellem den uautentificerede
 * Landing-applikation (`apps/landing` på Port 5173) og det beskyttede Dashboard
 * (`apps/dashboard` på Port 5174).
 *
 * ARKITEKTONISK OVERBLIK:
 *   1. `GatewayRoleHint`: Tilladte rolle-hints ved login (`CLIENT`, `PROVIDER`, `MANAGEMENT`).
 *   2. [Class: AuthGateway]: Modul med #buildLoginUrl(roleHint, baseUrl) og
 *      #initiateLogin(roleHint, navigate), der viderestiller brugeren til Dashboard-portalen.
 *
 * ARKITEKTONISK INVARIANT (Zero-Dashboard & Zero-React Boundary):
 * Denne fil må ALDRIG importere React, [AbstractClass: BaseApiService] eller beskyttede
 * forretnings-DTO'er fra Dashboard-slices.
 * ============================================================================
 */

export type GatewayRoleHint = "CLIENT" | "PROVIDER" | "MANAGEMENT";

export const AuthGateway = {
  dashboardUrl: "http://localhost:5174",

  /**
   * #buildLoginUrl(roleHint, baseUrl) — Konstruerer målets Dashboard-URL med
   * en valgfri `roleHint` query-parameter (`?roleHint=PROVIDER`).
   */
  buildLoginUrl(roleHint?: GatewayRoleHint, baseUrl?: string): string {
    const targetUrl = new URL(baseUrl || this.dashboardUrl);
    if (roleHint) {
      targetUrl.searchParams.set("roleHint", roleHint);
    }
    return targetUrl.toString();
  },

  /**
   * #initiateLogin(roleHint, navigate) — Starter OIDC/Portal login-handoff ved at
   * navigere browseren til URL'en fra #buildLoginUrl(roleHint).
   */
  initiateLogin(
    roleHint?: GatewayRoleHint,
    navigate: (url: string) => void = (url) => {
      window.location.assign(url);
    }
  ): string {
    const targetUrl = this.buildLoginUrl(roleHint);
    navigate(targetUrl);
    return targetUrl;
  },
};
