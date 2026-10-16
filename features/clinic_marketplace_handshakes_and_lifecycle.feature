@api @ui @e2e
Feature: Clinic Service Catalog, Marketplace Directory, Consent Handshakes, Rescheduling, PCL-5, and Live i18n Admin
  As a Client, Clinical Therapist, or Platform Administrator
  I want to manage clinic services, browse the marketplace directory, control client-therapist consent handshakes, reschedule/cancel appointments, submit PCL-5 assessments, and update live MongoDB translations
  So that all clinical and administrative workflows function end-to-end from the Next.js frontend and BFF to the Spring Boot backend

  # =========================================================================
  # 1. SERVICE CATALOG & MARKETPLACE DIRECTORY (Bilag 5.1.3)
  # =========================================================================

  @api
  Scenario: Therapist creates a clinic service, verifies it in the Marketplace Directory, and toggles its active status
    Given I am authenticated via Keycloak as user "4c421f46-836c-4897-8dae-ba9587473273" ("bijens") with roles "client, therapist"
    When the therapist creates a clinic service via BFF "/api/backend/clinic/services" with:
      | name            | Traume-fokuseret EMDR Session |
      | description     | 60 min klinisk traumeterapi   |
      | durationMinutes | 60                            |
      | price           | 1150                          |
      | location        | København K                   |
    Then the HTTP response status code should be 201
    And the JSON path "name" should equal "Traume-fokuseret EMDR Session"
    And the JSON path "isActive" should equal true
    When I send a REST Assured GET request to "/api/backend/clinic/directory"
    Then the HTTP response status code should be 200
    And the response body should contain "Traume-fokuseret EMDR Session"
    And the response body should contain "Nordic Mind"
    When the therapist toggles the created service active status via BFF
    Then the HTTP response status code should be 200
    And the JSON path "isActive" should equal false
    When the therapist toggles the created service active status via BFF
    Then the HTTP response status code should be 200
    And the JSON path "isActive" should equal true

  # =========================================================================
  # 2. CONSENT HANDSHAKES & FULL CLINICAL LIFECYCLE
  # =========================================================================

  @api
  Scenario: Client grants, revokes, and re-activates a Therapist Consent Handshake and submits a PCL-5 assessment visible in the Therapist Overview
    Given I am authenticated via Keycloak as user "5e357ca1-4913-414f-91a6-81a7de9042ab" ("anders_sand") with roles "client"
    When the client grants an "ACTIVE" consent handshake to therapist "4c421f46-836c-4897-8dae-ba9587473273" via BFF
    Then the HTTP response status code should be 200
    And the JSON path "status" should equal "ACTIVE"
    When the client updates the consent handshake status to "REVOKED" via BFF
    Then the HTTP response status code should be 200
    And the JSON path "status" should equal "REVOKED"
    When the client updates the consent handshake status to "ACTIVE" via BFF
    Then the HTTP response status code should be 200
    And the JSON path "status" should equal "ACTIVE"
    When I send a REST Assured POST request to "/api/backend/psychotraumatology/tests" with JSON body:
      """
      {
        "clientUuid": "5e357ca1-4913-414f-91a6-81a7de9042ab",
        "therapistUuid": "4c421f46-836c-4897-8dae-ba9587473273",
        "testType": "PCL-5",
        "score": 41,
        "severity": "Moderat til alvorlig",
        "answersJson": "{\"q1\":3,\"q2\":4,\"q3\":3,\"q4\":3,\"q5\":3}"
      }
      """
    Then the HTTP response status code should be 200
    And the JSON path "score" should equal 41
    When I send a REST Assured GET request to "/api/backend/psychotraumatology/tests/client/5e357ca1-4913-414f-91a6-81a7de9042ab"
    Then the HTTP response status code should be 200
    And the response body should contain "Moderat til alvorlig"
    Given I am authenticated via Keycloak as user "4c421f46-836c-4897-8dae-ba9587473273" ("bijens") with roles "client, therapist"
    When I send a REST Assured GET request to "/api/backend/clinic/therapist/4c421f46-836c-4897-8dae-ba9587473273/overview"
    Then the HTTP response status code should be 200
    And the response body should contain "5e357ca1-4913-414f-91a6-81a7de9042ab"
    And the response body should contain "41"

  @api @rbac
  Scenario: Client A is forbidden from viewing Client B's PCL-5 psychotraumatology assessments via BFF
    Given I am authenticated via Keycloak as user "f951db57-01ab-4693-bed4-17d03f0870f1" ("client2") with roles "client"
    When I send a REST Assured GET request to "/api/backend/psychotraumatology/tests/client/5e357ca1-4913-414f-91a6-81a7de9042ab"
    Then the HTTP response status code should be 403

  @api
  Scenario: Rescheduling an appointment via BFF succeeds when the slot is free, returns 409 Conflict on overlap, and supports cancellation
    Given I am authenticated via Keycloak as user "5e357ca1-4913-414f-91a6-81a7de9042ab" ("anders_sand") with roles "client"
    When the client books an appointment via BFF with therapist "4c421f46-836c-4897-8dae-ba9587473273" from "2026-10-22T09:00:00" to "2026-10-22T10:00:00"
    Then the HTTP response status code should be 201
    When the client reschedules that appointment via BFF to "2026-10-22T11:00:00" through "2026-10-22T12:00:00"
    Then the HTTP response status code should be 200
    And the JSON path "startTime" should equal "2026-10-22T11:00:00"
    When the client reschedules that appointment via BFF to "2026-10-14T10:00:00" through "2026-10-14T11:00:00"
    Then the HTTP response status code should be 409
    When the client cancels that appointment via BFF
    Then the HTTP response status code should be 200

  @api @ui
  Scenario: Admin updates a live i18n dictionary translation key via BFF and verifies immediate propagation
    Given I am authenticated via Keycloak as user "4c421f46-836c-4897-8dae-ba9587473273" ("bijens") with roles "client, therapist, admin"
    When I send a REST Assured PUT request to "/api/backend/i18n/da/customBanner" with JSON body:
      """
      {
        "value": "Velkommen til INTEGRATE Klinikportal"
      }
      """
    Then the HTTP response status code should be 200
    When I send a REST Assured GET request to "/api/backend/i18n/da"
    Then the HTTP response status code should be 200
    And the JSON path "customBanner" should equal "Velkommen til INTEGRATE Klinikportal"
    When I open the frontend page "/da/dashboard/admin"
    Then the rendered page should contain text "Live MongoDB Sprog-"

