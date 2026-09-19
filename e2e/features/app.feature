Feature: App Load
  Scenario: Load the main page
    Given the application is loaded
    Then the title should be "integrate-frontend"
