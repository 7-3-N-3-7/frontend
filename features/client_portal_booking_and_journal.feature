Feature: Client Portal Booking (409 Conflict Protection) and Privacy-Filtered JGit Timeline
  As a client using the Personal Portal
  I want to book appointments without double-booking conflicts and inspect my own JGit journal timeline
  While confidential therapist notes (INTERNAL_MEDICAL_NOTES) remain strictly hidden from my view

  @api
  Scenario: Client booking an available slot succeeds with 201 Created, while double-booking the same therapist slot returns 409 Conflict
    Given I am authenticated via Keycloak as user "5e357ca1-4913-414f-91a6-81a7de9042ab" ("anders_sand") with roles "client"
    When I send a REST Assured POST request to "/api/backend/appointments" with JSON body:
      """
      {
        "clientUuid": "5e357ca1-4913-414f-91a6-81a7de9042ab",
        "therapistUuid": "4c421f46-836c-4897-8dae-ba9587473273",
        "serviceId": "srv-1",
        "title": "Ny Terapisamtale",
        "startTime": "2026-10-15T09:00:00",
        "endTime": "2026-10-15T10:00:00"
      }
      """
    Then the HTTP response status code should be 201
    When I send a REST Assured POST request to "/api/backend/appointments" with JSON body:
      """
      {
        "clientUuid": "5e357ca1-4913-414f-91a6-81a7de9042ab",
        "therapistUuid": "4c421f46-836c-4897-8dae-ba9587473273",
        "serviceId": "srv-1",
        "title": "Overlap Samtale",
        "startTime": "2026-10-15T09:00:00",
        "endTime": "2026-10-15T10:00:00"
      }
      """
    Then the HTTP response status code should be 409

  @api @ui
  Scenario: Client saves a new diary entry and views their JGit History Timeline without seeing INTERNAL_MEDICAL_NOTES
    Given I am authenticated via Keycloak as user "5e357ca1-4913-414f-91a6-81a7de9042ab" ("anders_sand") with roles "client"
    When I send a REST Assured POST request to "/api/backend/journals" with JSON body:
      """
      {
        "clientUuid": "5e357ca1-4913-414f-91a6-81a7de9042ab",
        "title": "Aftenens Tanker",
        "content": "Gåturen ved vandet hjalp på min ro.",
        "moodRating": 9,
        "sharedWithTherapists": true
      }
      """
    Then the HTTP response status code should be 200
    When I send a REST Assured GET request to "/api/backend/journals/history/5e357ca1-4913-414f-91a6-81a7de9042ab"
    Then the HTTP response status code should be 200
    And the response body should contain "Gåturen ved vandet hjalp på min ro."
    And the response body should NOT contain "INTERNAL_MEDICAL_NOTES"
    When I open the frontend page "/da/dashboard/personal"
    Then the rendered page should NOT contain text "Fortrolige noter"

  @api @ui
  Scenario: Client sees shared therapist JournalEntries created after confidential INTERNAL_MEDICAL_NOTES while confidential notes remain hidden
    Given I am authenticated via Keycloak as user "4c421f46-836c-4897-8dae-ba9587473273" ("bijens") with roles "client, therapist"
    When I send a REST Assured POST request to "/api/backend/journals/therapist-notes" with JSON body:
      """
      {
        "clientUuid": "5e357ca1-4913-414f-91a6-81a7de9042ab",
        "therapistNote": "Ander skal IKKE kunne se den her besked",
        "therapistName": "Bo Jensen",
        "organisationName": "Nordic Mind Clinic ApS"
      }
      """
    Then the HTTP response status code should be 200
    When I send a REST Assured POST request to "/api/backend/journals" with JSON body:
      """
      {
        "clientUuid": "5e357ca1-4913-414f-91a6-81a7de9042ab",
        "title": "Terapeutisk opfølgning (Delt med klient)",
        "content": "Anders skal kunne se den her besked",
        "moodRating": 8,
        "sharedWithTherapists": true
      }
      """
    Then the HTTP response status code should be 200
    Given I am authenticated via Keycloak as user "5e357ca1-4913-414f-91a6-81a7de9042ab" ("anders_sand") with roles "client"
    When I send a REST Assured GET request to "/api/backend/journals/client/5e357ca1-4913-414f-91a6-81a7de9042ab"
    Then the HTTP response status code should be 200
    And the response body should contain "Anders skal kunne se den her besked"
    And the response body should NOT contain "Ander skal IKKE kunne se den her besked"
    When I send a REST Assured GET request to "/api/backend/journals/history/5e357ca1-4913-414f-91a6-81a7de9042ab"
    Then the HTTP response status code should be 200
    And the response body should contain "Anders skal kunne se den her besked"
    And the response body should NOT contain "Ander skal IKKE kunne se den her besked"
    And the response body should NOT contain "INTERNAL_MEDICAL_NOTES"
    When I open the frontend page "/da/dashboard/personal"
    Then the rendered page should contain text "Anders skal kunne se den her besked"
    And the rendered page should NOT contain text "Ander skal IKKE kunne se den her besked"

