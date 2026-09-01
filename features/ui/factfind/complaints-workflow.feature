@complaints-workflow @a2ui @v3
Feature: Complaints Workflow A2UI customer profile

  Scenario Outline: Validate Customer Profile UI rendering against ADK response contract
    Given user navigates to the Complaints Workflow
    When user searches for complaint reference "<complaintRef>" in complaints workflow
    And complaints agent output is displayed
    Then complaint reference should be displayed correctly in complaints workflow
    And the complaints workflow A2UI rendered UI should match the agent contract:
      | section         |
      | customerProfile |
    Examples:
      | complaintRef |
      | NC10010449   |
