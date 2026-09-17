Feature: Infrastructure Health Check
  In order to ensure deployments are successful
  As a DevOps engineer
  I want to verify that all core infrastructure components are online and reachable

  Scenario: Verify ZITADEL Identity Provider is reachable
    Given the infrastructure is deployed
    When I send a GET request to the ZITADEL health endpoint at "http://localhost:8080/debug/health"
    Then I should receive a 200 OK status

  Scenario: Verify Backend API is reachable
    Given the infrastructure is deployed
    When I send a GET request to the Backend health endpoint at "http://localhost:8081/actuator/health"
    Then I should receive a 200 OK status
    And the response body should contain "UP"

  Scenario: Verify Frontend Web Server is reachable
    Given the infrastructure is deployed
    When I navigate to the frontend URL at "http://localhost:3000/"
    Then the page should load successfully
