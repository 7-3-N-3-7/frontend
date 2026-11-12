@e2e @iban @currency @jgit-branch
Feature: Frontend E2E Therapist Mandatory IBAN & Currency Setup, Service Booking, and Single-Branch JGit Handshake Restrictions
  As a Therapist and Client using the Next.js Frontend & BFF
  I want to configure my mandatory clinic IBAN and java.util.Currency before creating a service, book that service as a client, and restrict the therapist handshake to only 1 of my JGit branches with custom permission restrictions
  So that payout IBANs and currencies are always set up and JGit branch isolation is enforced end-to-end

  Scenario: Therapist configures mandatory IBAN & Currency, creates a service, client books it and restricts handshake to 1 JGit branch
    Given I am authenticated via Keycloak as user "4c421f46-836c-4897-8dae-ba9587473273" ("bijens") with roles "client,therapist"
    When the therapist attempts to create a service before setting IBAN via BFF "/api/backend/clinic/services"
    Then the HTTP response status code should be 400
    And the response body should contain "IBAN"
    When the therapist saves clinic setup with IBAN "DK5000400440116243" and currency "DKK" via BFF "/api/backend/clinic/therapist-onboarding"
    Then the HTTP response status code should be 200
    And the JSON path "iban" should equal "DK5000400440116243"
    And the JSON path "currency" should equal "DKK"
    When the therapist creates a clinic service via BFF "/api/backend/clinic/services" with:
      | name            | Traumefokuseret EMDR |
      | description     | 60 min session       |
      | durationMinutes | 60                   |
      | price           | 1150                 |
      | currency        | DKK                  |
      | location        | København K          |
    Then the HTTP response status code should be 201
    And the JSON path "currency" should equal "DKK"
    Given I am authenticated via Keycloak as user "5e357ca1-4913-414f-91a6-81a7de9042ab" ("anders_sand") with roles "client"
    When the client commits a journal entry on JGit branch "branch-emdr" with title "EMDR Notat" and content "Delt på branch-emdr" via BFF
    And the client commits a journal entry on JGit branch "branch-privat" with title "Privat Notat" and content "Kun på branch-privat" via BFF
    And the client books the created service via BFF with therapist "4c421f46-836c-4897-8dae-ba9587473273" from "2027-11-15T10:00:00" to "2027-11-15T11:00:00"
    Then the HTTP response status code should be 201
    When the client grants an "ACTIVE" handshake to therapist "4c421f46-836c-4897-8dae-ba9587473273" allowing only JGit branch "branch-emdr" and custom restrictions "NO_MOOD_SCORES,READ_ONLY_TIMELINE" via BFF
    Then the HTTP response status code should be 200
    And the JSON path "allowedBranches" should equal "branch-emdr"
    And the JSON path "customRestrictions" should equal "NO_MOOD_SCORES,READ_ONLY_TIMELINE"
    Given I am authenticated via Keycloak as user "4c421f46-836c-4897-8dae-ba9587473273" ("bijens") with roles "client,therapist"
    When I send a REST Assured GET request to "/api/backend/journals/history/5e357ca1-4913-414f-91a6-81a7de9042ab?therapistUuid=4c421f46-836c-4897-8dae-ba9587473273"
    Then the HTTP response status code should be 200
    And the response body should contain "Delt på branch-emdr"
    And the response body should NOT contain "Kun på branch-privat"

  Scenario: Client grants therapist access to multiple JGit branches with 1 or more custom restrictions per row [branch, restriction(s)] via BFF
    Given I am authenticated via Keycloak as user "5e357ca1-4913-414f-91a6-81a7de9042ab" ("anders_sand") with roles "client"
    When the client commits a journal entry on JGit branch "branch-trauma-therapy" with title "Traume Session" and content "Delt på branch-trauma-therapy" via BFF
    And the client commits a journal entry on JGit branch "branch-anxiety-log" with title "Angst Dagbog" and content "Delt på branch-anxiety-log" via BFF
    And the client commits a journal entry on JGit branch "branch-private-diary" with title "Privat Dagbog" and content "Hemmeligt på branch-private-diary" via BFF
    And the client grants an "ACTIVE" handshake to therapist "4c421f46-836c-4897-8dae-ba9587473273" via BFF with per-branch custom restrictions:
      | branch                | restrictions                        |
      | branch-trauma-therapy | NO_MOOD_SCORES,READ_ONLY_TIMELINE   |
      | branch-anxiety-log    | NO_CLINICAL_NOTES_EXPORT            |
    Then the HTTP response status code should be 200
    And the JSON path "branchRestrictions" should equal "branch-trauma-therapy:NO_MOOD_SCORES,READ_ONLY_TIMELINE;branch-anxiety-log:NO_CLINICAL_NOTES_EXPORT"
    Given I am authenticated via Keycloak as user "4c421f46-836c-4897-8dae-ba9587473273" ("bijens") with roles "client,therapist"
    When I send a REST Assured GET request to "/api/backend/journals/history/5e357ca1-4913-414f-91a6-81a7de9042ab?therapistUuid=4c421f46-836c-4897-8dae-ba9587473273"
    Then the HTTP response status code should be 200
    And the response body should contain "Delt på branch-trauma-therapy"
    And the response body should contain "Delt på branch-anxiety-log"
    And the response body should NOT contain "Hemmeligt på branch-private-diary"
    When the therapist fetches the client journal bundle for "5e357ca1-4913-414f-91a6-81a7de9042ab" via BFF with therapistUuid "4c421f46-836c-4897-8dae-ba9587473273"
    Then the therapist's BFF view of branch "branch-trauma-therapy" should have moodRating masked as null while branch "branch-anxiety-log" retains moodRating 8

  Scenario: Therapist cannot see their own clinic services when browsing the Service Marketplace from their personal client profile via BFF
    Given I am authenticated via Keycloak as user "4c421f46-836c-4897-8dae-ba9587473273" ("bijens") with roles "client,therapist"
    When the therapist saves clinic setup with IBAN "DK5000400440116243" and currency "DKK" via BFF "/api/backend/clinic/therapist-onboarding"
    And the therapist creates a clinic service via BFF "/api/backend/clinic/services" with:
      | name            | Bo Jensens Egne Samtaler |
      | description     | Bo Jensens egen ydelse   |
      | durationMinutes | 60                       |
      | price           | 950                      |
      | currency        | DKK                      |
      | location        | København K              |
    Then the HTTP response status code should be 201
    When I send a REST Assured GET request to "/api/backend/clinic/client/4c421f46-836c-4897-8dae-ba9587473273/overview"
    Then the HTTP response status code should be 200
    And the response body should NOT contain "Bo Jensens Egne Samtaler"
    Given I am authenticated via Keycloak as user "5e357ca1-4913-414f-91a6-81a7de9042ab" ("anders_sand") with roles "client"
    When I send a REST Assured GET request to "/api/backend/clinic/client/5e357ca1-4913-414f-91a6-81a7de9042ab/overview"
    Then the HTTP response status code should be 200
    And the response body should contain "Bo Jensens Egne Samtaler"
