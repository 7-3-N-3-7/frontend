import NextAuth, { AuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";
import { sessionCookieName, sessionCookieOptions } from "@/lib/auth-cookies";

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
  ],
  pages: {
    signIn: '/', 
  },
  cookies: {
    sessionToken: {
      name: sessionCookieName,
      options: sessionCookieOptions,
    },
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        
        try {
          const base64Url = account.access_token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(
            atob(base64)
              .split('')
              .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          );
          const decoded = JSON.parse(jsonPayload);
          token.roles = decoded.realm_access?.roles || [];
          token.username = decoded.preferred_username || user?.name || user?.email;
          token.accessTokenExpires = decoded.exp * 1000;
        } catch (e) {
          console.error("Failed to decode token in JWT callback", e);
          token.roles = [];
        }
        if (!token.accessTokenExpires && account.expires_at) {
          token.accessTokenExpires = account.expires_at * 1000;
        }
        return token;
      }

      // Return previous token if the access token has not expired yet
      if (Date.now() < (token.accessTokenExpires as number) - 10 * 1000) { // Check 10 seconds before expiry
        return token;
      }

      // Access token has expired, try to update it
      return refreshAccessToken(token);
    },
    async session({ session, token }: any) {
      session.accessToken = token.accessToken;
      session.roles = token.roles || [];
      session.user = session.user || {};
      session.user.name = token.username;
      session.error = token.error;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
