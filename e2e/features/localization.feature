Feature: Frontend Localization UI
  As a user
  I want to switch the application language
  So that I can view the interface in my preferred language (English or Danish)

  Scenario: Toggling language between English and Danish updates the UI text
    Given the application is loaded
    When I click the language switcher and select "Danish"
    Then the navigation menu should display "Overblik"
    When I click the language switcher and select "English"
    Then the navigation menu should display "Overview"
