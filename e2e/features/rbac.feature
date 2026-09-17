Feature: Role-Based Access Control (RBAC) Display
  As a user with specific roles, organizations, and services
  I want to see my attributes displayed on the frontend dashboard
  So that I can verify my Zitadel authentication was successful

  Scenario Outline: Verify user attributes on the dashboard
    Given I navigate to the frontend application
    When I log in as "<username>" with password "<password>"
    Then I should see the welcome message containing role "<role>", organization "<organization>", and service "<service>"

    Examples:
      | username                | password   | role   | organization | service   |
      | admin_acme_billing      | Password1! | Admin  | Acme Corp    | Billing   |
      | editor_acme_analytics   | Password1! | Editor | Acme Corp    | Analytics |
      | viewer_acme_support     | Password1! | Viewer | Acme Corp    | Support   |
      | admin_globex_analytics  | Password1! | Admin  | Globex       | Analytics |
