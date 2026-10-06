import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { username, password, email, firstName, lastName } = data;

    const issuerUrl = process.env.KEYCLOAK_ISSUER || ""; // e.g. https://login.../realms/EduJournal
    // Extract base URL from issuer
    const baseUrl = issuerUrl.split('/realms/')[0];
    const realm = issuerUrl.split('/realms/')[1];

    // 1. Get Admin Token
    const tokenEndpoint = `${issuerUrl}/protocol/openid-connect/token`;
    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", process.env.KEYCLOAK_ADMIN_CLIENT_ID || "");
    params.append("client_secret", process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || "");

    const tokenRes = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("Admin Token Error:", tokenData);
      return NextResponse.json({ error: "Failed to authenticate admin client" }, { status: 500 });
    }

    const adminToken = tokenData.access_token;

    // 2. Create User
    const usersEndpoint = `${baseUrl}/admin/realms/${realm}/users`;
    const newUser = {
      username: username,
      email: email,
      firstName: firstName,
      lastName: lastName,
      enabled: true,
      emailVerified: false,
      credentials: [{
        type: "password",
        value: password,
        temporary: false
      }]
    };

    const createRes = await fetch(usersEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify(newUser)
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      console.error("Create User Error:", errorText);
      return NextResponse.json({ error: "Failed to create user in Keycloak" }, { status: 400 });
    }

    const userId = createRes.headers.get('location')?.split('/').pop();
    if (!userId) {
      return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 });
    }

    const verificationRes = await fetch(`${usersEndpoint}/${userId}/send-verify-email`, {
      method: "PUT",
      headers: {
        "Authorization": "Bearer " + adminToken,
      },
    });

    if (!verificationRes.ok) {
      console.error("Keycloak Verification Email Error:", await verificationRes.text());
      return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Registration endpoint error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
