Feature: Keycloak as Sole Role Authority and BFF Endpoint Protection
  As a security architect
  I want Keycloak to be the sole decider of roles and access across the frontend BFF and backend
  So that business database tables (provider_profiles) never grant ROLE_therapist without a Keycloak role

  @api
  Scenario: Unauthenticated request to BFF protected endpoint is rejected with 401 Unauthorized
    Given I have no active Keycloak session
    When I send a REST Assured GET request to "/api/backend/clinic/me"
    Then the HTTP response status code should be 401

  @api
  Scenario: Client with a ProviderProfile in business_db but only "client" role in Keycloak does NOT get therapist access
    Given I am authenticated via Keycloak as user "3229b65b-0e95-4dc6-8336-ac7a5a56edc1" ("test_user") with roles "client"
    And a ProviderProfile exists in business_db for user "3229b65b-0e95-4dc6-8336-ac7a5a56edc1"
    When I send a REST Assured GET request to "/api/backend/clinic/me"
    Then the HTTP response status code should be 200
    And the JSON path "isTherapist" should equal false
    When I send a REST Assured POST request to "/api/backend/journals/therapist-notes" with JSON body:
      """
      {
        "clientUuid": "5e357ca1-4913-414f-91a6-81a7de9042ab",
        "therapistNote": "Forsøg uden Keycloak therapist-rolle",
        "therapistName": "Mette Lind",
        "organisationName": "Lind Klinik ApS"
      }
      """
    Then the HTTP response status code should be 403

  @api
  Scenario: Client upgrading via CVR onboarding receives the "therapist" role in Keycloak and gains therapist access after token refresh
    Given I am authenticated via Keycloak as user "9a8b7c6d-1111-2222-3333-444455556666" ("mette_lind") with roles "client"
    When I send a REST Assured POST request to "/api/backend/clinic/therapist-onboarding" with JSON body:
      """
      {
        "userUuid": "9a8b7c6d-1111-2222-3333-444455556666",
        "cvrNumber": "44556677",
        "organisationName": "Lind Psykoterapi ApS",
        "displayName": "Mette Lind (Cand.psych.)"
      }
      """
    Then the HTTP response status code should be 200
    When my NextAuth session refreshes its Keycloak token with the newly assigned Keycloak roles
    And I send a REST Assured GET request to "/api/backend/clinic/me"
    Then the HTTP response status code should be 200
    And the JSON path "isTherapist" should equal true
    When I send a REST Assured POST request to "/api/backend/journals/therapist-notes" with JSON body:
      """
      {
        "clientUuid": "5e357ca1-4913-414f-91a6-81a7de9042ab",
        "therapistNote": "Klinisk notat godkendt via Keycloak therapist-rolle.",
        "therapistName": "Mette Lind",
        "organisationName": "Lind Psykoterapi ApS"
      }
      """
    Then the HTTP response status code should be 200
