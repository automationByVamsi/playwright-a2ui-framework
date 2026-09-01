@browser
Feature: Validate Complaints Workflow rendered UI

  Compare #2: the ADK contract is the expected model; Playwright extracts the stub page.

  Scenario: Stub renders every customer from the contract
    Given the complaint reference "NC10010449"
    When the Complaints Workflow is executed in the UI
    Then validation should pass
    And the rendered UI should contain 2 customer profiles
    And the rendered UI layer should be "PASS"

  Scenario: Dropped customer tab is a UI rendering failure
    Given the complaint reference "NC10010449"
    And the rendered UI hides customer "1420289780"
    When the Complaints Workflow is executed in the UI
    Then validation should fail
    And the failure class should be "UI_RENDERING_FAILURE"
    And the missing customer should be named "Frederick Hussain"
    And the missing party id should be "1420289780"
    And the rendered path should be "NOT FOUND"
