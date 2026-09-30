import NextAuth, { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: AuthOptions = {
  providers: [
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
          params.append("scope", "openid profile email roles");

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

          // Return an object that NextAuth will pass to the jwt callback
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
    signIn: '/', // Set our custom login page to the root landing page!
  },
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false, // Force false because the project runs on HTTP via nip.io
        domain: '.127.0.0.1.nip.io'
      }
    }
  },
  callbacks: {
    async jwt({ token, user, account }) {
      // Initial sign in
      if (user) {
        token.accessToken = (user as any).access_token;
        token.refreshToken = (user as any).refresh_token;
        
        // Decode token to get roles
        try {
          const base64Url = ((user as any).access_token as string).split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(
            atob(base64)
              .split('')
              .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          );
          const decoded = JSON.parse(jsonPayload);
          token.roles = decoded.realm_access?.roles || [];
          token.username = decoded.preferred_username;
        } catch (e) {
          console.error("Failed to decode token in JWT callback", e);
          token.roles = [];
        }
      }
      return token;
    },
    async session({ session, token }: any) {
      session.accessToken = token.accessToken;
      session.roles = token.roles || [];
      session.user = session.user || {};
      session.user.name = token.username;
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
