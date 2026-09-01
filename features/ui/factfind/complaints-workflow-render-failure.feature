@complaints-workflow @a2ui @v3 @drop-rendered
Feature: Complaints Workflow A2UI render-failure fixture

  Local-only proof that a missing rendered customer is UI_RENDERING_FAILURE.
  Do not copy this feature to the work repo; live Hive has no ?drop= query.

  Scenario: Dropped customer tab is a UI rendering failure
    Given the rendered UI hides customer party id "1420289780"
    And user navigates to the Complaints Workflow
    When user searches for complaint reference "NC10010449" in complaints workflow
    And complaints agent output is displayed
    Then complaint reference should be displayed correctly in complaints workflow
    And the complaints workflow A2UI rendered UI is compared to the agent contract:
      | section         |
      | customerProfile |
    And the A2UI validation should fail with class "UI_RENDERING_FAILURE"
