import NextAuth, { AuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";
import { sessionCookieName, sessionCookieOptions } from "@/lib/auth-cookies";
import CredentialsProvider from "next-auth/providers/credentials";

async function refreshAccessToken(token: any) {
  try {
    const issuerUrl = process.env.KEYCLOAK_ISSUER || "";
    const tokenEndpoint = `${issuerUrl}/protocol/openid-connect/token`;

    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("client_id", process.env.KEYCLOAK_CLIENT_ID || "");
    params.append("client_secret", process.env.KEYCLOAK_CLIENT_SECRET || "");
    params.append("refresh_token", token.refreshToken);

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const refreshedTokens = await response.json();

    if (!response.ok) {
      throw refreshedTokens;
    }

    const base64Url = refreshedTokens.access_token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const decoded = JSON.parse(jsonPayload);

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken, // Fall back to old refresh token
      accessTokenExpires: decoded.exp * 1000,
      userUuid: decoded.sub || token.userUuid,
      fullName: decoded.name || token.fullName || decoded.preferred_username,
      email: decoded.email || token.email,
      roles: decoded.realm_access?.roles || [],
      username: decoded.preferred_username
    };
  } catch (error) {
    console.error("RefreshAccessTokenError", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

export const authOptions: AuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID || "",
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || "",
      issuer: process.env.KEYCLOAK_ISSUER || "",
      authorization: {
        params: { scope: "openid profile email roles offline_access" },
      },
    }),
    CredentialsProvider({
      name: "Keycloak",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }
        
        try {
          const issuerUrl = process.env.KEYCLOAK_ISSUER || "";
          const tokenEndpoint = `${issuerUrl}/protocol/openid-connect/token`;

          const params = new URLSearchParams();
          params.append("grant_type", "password");
          params.append("client_id", process.env.KEYCLOAK_CLIENT_ID || "");
          params.append("client_secret", process.env.KEYCLOAK_CLIENT_SECRET || "");
          params.append("username", credentials.username);
          params.append("password", credentials.password);
          params.append("scope", "openid profile email roles offline_access"); // added offline_access for refresh tokens

          const response = await fetch(tokenEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
          });

          const data = await response.json();

          if (!response.ok) {
            console.error("Keycloak Login Failed:", data);
            return null;
          }

          return {
            id: credentials.username,
            name: credentials.username,
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in
          };
        } catch (e) {
          console.error("Authorize error", e);
          return null;
        }
      }
    })
  ],
  pages: {
    signIn: '/', 
  },
  cookies: {
    sessionToken: {
      name: sessionCookieName,
      options: sessionCookieOptions,
    }
  },
  callbacks: {
    async jwt({ token, user, account, trigger }) {
      console.log("JWT Callback Triggered:", { 
        hasUser: !!user, 
        hasAccount: !!account,
        trigger,
        isInitialSignIn: !!(account || user),
        currentExp: token.accessTokenExpires 
      });

      // 0. Explicit session update (e.g. after Keycloak role assignment on CVR onboarding)
      if (trigger === "update" && token.refreshToken) {
        console.log("Session update triggered — refreshing Keycloak token for latest roles...");
        return refreshAccessToken(token);
      }

      // 1. Initial Sign In
      if (account?.access_token || (user && 'access_token' in user)) {
        console.log("Processing Initial Sign In...");
        
        token.accessToken = account?.access_token || (user as any).access_token;
        token.refreshToken = account?.refresh_token || (user as any).refresh_token;
        
        console.log("Extracted Tokens:", {
          hasAccessToken: !!token.accessToken,
          hasRefreshToken: !!token.refreshToken
        });

        try {
          const base64Url = (token.accessToken as string).split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(
            atob(base64)
              .split('')
              .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          );
          const decoded = JSON.parse(jsonPayload);
          token.userUuid = decoded.sub;
          token.roles = decoded.realm_access?.roles || [];
          token.username = decoded.preferred_username || user?.name || user?.email;
          token.fullName = decoded.name || token.username;
          token.email = decoded.email || user?.email;
          token.accessTokenExpires = decoded.exp * 1000;
          console.log("Decoded Token Expiry:", new Date(token.accessTokenExpires as number).toISOString());
        } catch (e) {
          console.error("Failed to decode token in JWT callback", e);
          token.roles = [];
        }

        // Fallback for expiration if decoding fails
        const expires_at = account?.expires_at || (user as any)?.expires_in;
        if (!token.accessTokenExpires && expires_at) {
          token.accessTokenExpires = Date.now() + expires_at * 1000;
        }
        
        return token;
      }

      // 2. Subsequent requests
      if (!token.accessTokenExpires) {
        console.log("Token is completely missing an expiration date! (Likely an old broken cookie). Forcing refresh/re-login.");
        return refreshAccessToken(token);
      }

      const timeRemaining = (token.accessTokenExpires as number) - Date.now();
      console.log("Checking Token Expiration:", {
        expiresAt: new Date(token.accessTokenExpires as number).toISOString(),
        timeRemainingMs: timeRemaining
      });

      if (timeRemaining > 10000) {
        return token;
      }

      // 3. Access token has expired, try to update it
      console.log("Token expired! Attempting to refresh...", { hasRefreshToken: !!token.refreshToken });
      return refreshAccessToken(token);
    },
    async session({ session, token }: any) {
      session.accessToken = token.accessToken;
      session.roles = token.roles || [];
      session.user = session.user || {};
      session.user.id = token.userUuid || token.sub;
      session.user.name = token.fullName || token.username;
      session.user.username = token.username;
      session.user.email = token.email;
      session.error = token.error;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
