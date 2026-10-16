Feature: Therapist Multi-Window Workspace and Date-Grouped JGit History Timeline
  As a clinical therapist with the Keycloak "therapist" role
  I want to view the client's JGit History Timeline in a dedicated side-by-side Multi-Window workspace grouped by date with Delta/Snapshot toggling
  So that I can inspect every revision (including INTERNAL_MEDICAL_NOTES) alongside the active journal window

  @api
  Scenario: Therapist overview returns daily appointment counts for the Monthly Calendar badges
    Given I am authenticated via Keycloak as user "4c421f46-836c-4897-8dae-ba9587473273" ("bijens") with roles "client, therapist"
    When I send a REST Assured GET request to "/api/backend/clinic/therapist/4c421f46-836c-4897-8dae-ba9587473273/overview"
    Then the HTTP response status code should be 200
    And the JSON path "dailyCounts.2026-10-14" should equal 2

  @api
  Scenario: Therapist JGit commit history includes confidential INTERNAL_MEDICAL_NOTES and synchronizes live when a new clinical note is saved
    Given I am authenticated via Keycloak as user "4c421f46-836c-4897-8dae-ba9587473273" ("bijens") with roles "client, therapist"
    When I send a REST Assured GET request to "/api/backend/journals/history/5e357ca1-4913-414f-91a6-81a7de9042ab"
    Then the HTTP response status code should be 200
    And the response body should contain "INTERNAL_MEDICAL_NOTES"
    When I send a REST Assured POST request to "/api/backend/journals/therapist-notes" with JSON body:
      """
      {
        "clientUuid": "5e357ca1-4913-414f-91a6-81a7de9042ab",
        "therapistNote": "Live-synkroniseret EMDR-opfølgning i JGit tidslinjen.",
        "therapistName": "Bo Jensen",
        "organisationName": "Nordic Mind Clinic ApS"
      }
      """
    Then the HTTP response status code should be 200
    When I send a REST Assured GET request to "/api/backend/journals/history/5e357ca1-4913-414f-91a6-81a7de9042ab"
    Then the HTTP response status code should be 200
    And the response body should contain "Live-synkroniseret EMDR-opfølgning i JGit tidslinjen."

  @ui
  Scenario: Therapist opens Client Journal and JGit History Timeline side-by-side and toggles between Delta/Diff and Snapshot
    Given I am authenticated via Keycloak as user "4c421f46-836c-4897-8dae-ba9587473273" ("bijens") with roles "client, therapist"
    And I open the frontend page "/da/dashboard/therapist"
    Then the rendered page should contain text "2 aftaler"
    And the Multi-Window dock should display both "CLIENT_JOURNAL" and "JGIT_TIMELINE" windows side-by-side
    And the JGit timeline should group commits by date "2026-10-14" with neutral timeline dots
    And the JGit timeline should default to "DELTA" view showing "+ " added lines
    When I toggle the JGit timeline view mode to "SNAPSHOT"
    Then the JGit timeline should display the full document snapshot mode
    When I click the latest commit badge in the Client Journal window
    Then the JGit timeline window should focus that commit

