Feature: Multi-Language Switching and MongoDB i18n Dictionary Synchronization
  As a platform user (Client or Therapist)
  I want to switch the interface language seamlessly between Danish, English, French, Spanish, and German
  So that all portal workspaces, calendar views, and landing pages render in my preferred language

  @api
  Scenario Outline: Fetching fresh i18n dictionary from the BFF API for all 5 supported languages
    When I send a REST Assured GET request to "/api/backend/i18n/<locale>"
    Then the HTTP response status code should be 200
    And the JSON path "portal.tabCalendar" should equal "<expectedCalendarTab>"
    And the JSON path "portal.appointmentsCountBadge" should equal "<expectedCountBadge>"

    Examples:
      | locale | expectedCalendarTab               | expectedCountBadge   |
      | da     | Månedskalender & Dagsprogram      | {count} aftaler      |
      | en     | Monthly Calendar & Daily Schedule | {count} appointments |
      | fr     | Calendrier Mensuel & Programme    | {count} rdv          |
      | es     | Calendario Mensual y Agenda       | {count} citas        |
      | de     | Monatskalender & Tagesplan        | {count} Termine      |

  @ui
  Scenario: Switching language in the UI updates the rendered page locale and translated headings
    Given I open the frontend page "/da"
    Then the rendered page should have html lang "da"
    And the rendered page should contain text "Reflekter, Lær, og Voks"
    When I switch the UI language to "fr"
    Then the rendered page should have html lang "fr"
    And the rendered page should contain text "Réfléchissez, Apprenez et Grandissez"
    When I switch the UI language to "es"
    Then the rendered page should have html lang "es"
    And the rendered page should contain text "Reflexiona, Aprende y Crece"

