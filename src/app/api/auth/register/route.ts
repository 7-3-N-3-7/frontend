import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, username, password, homeAddress, phoneNumber, ssn } = body;

    // ---------------------------------------------------------
    // 1. Authenticate with Keycloak Admin API (Service Account)
    // ---------------------------------------------------------
    const keycloakUrl = process.env.KEYCLOAK_URL || 'http://login.157.180.43.151.nip.io';
    const realm = process.env.KEYCLOAK_REALM || 'edujournal';
    
    console.log(`[Next.js Backend] Orchestrating registration for user: ${username}`);
    
    // In a real implementation, you would:
    // A. Fetch an Admin Access Token using client_credentials
    // const adminTokenRes = await fetch(`${keycloakUrl}/realms/master/protocol/openid-connect/token`, ...);
    
    // B. Create the User in Keycloak
    // await fetch(`${keycloakUrl}/admin/realms/${realm}/users`, {
    //   method: 'POST',
    //   headers: { Authorization: `Bearer ${adminToken}` },
    //   body: JSON.stringify({ username, email, enabled: true, credentials: [{ type: 'password', value: password, temporary: false }] })
    // });
    
    // ---------------------------------------------------------
    // 2. Fetch User's JWT (Log them in automatically)
    // ---------------------------------------------------------
    // const userTokenRes = await fetch(`${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`, ...);
    // const userJwt = userTokenRes.access_token;
    
    // ---------------------------------------------------------
    // 3. Send Extended Profile Data to Spring Boot Resource Server
    // ---------------------------------------------------------
    // await fetch(`http://backend:8081/api/v1/therapists/profile`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${userJwt}` // Spring Boot validates this token against remote Keycloak
    //   },
    //   body: JSON.stringify({ homeAddress, phoneNumber, ssn })
    // });

    // For now, simulate success so the user can test the routing flow!
    return NextResponse.json({ success: true, message: 'User registered in Keycloak and Spring Boot.' });

  } catch (error) {
    console.error('Registration Orchestration Failed:', error);
    return NextResponse.json({ error: 'Failed to process registration' }, { status: 500 });
  }
}
