@complaints-workflow @v3
Feature: Complaints Workflow fact-find contract and A2UI

  # JSON only — no Hive login, no search. Add every complaint ref here.
  @factfind-contract
  Scenario Outline: Fact-find ADK matches aggregated payload
    When aggregated payload and ADK trace are loaded for "<complaintRef>"
    Then the complaints workflow fact find should match the aggregated payload
    Examples:
      | complaintRef |
      | NC10010449   |

  # Handful of UI scripts. Uses existing stub unless tagged @live.
  @a2ui
  Scenario Outline: Rendered UI matches the ADK contract
    Given user navigates to the Complaints Workflow
    When user searches for complaint reference "<complaintRef>" in complaints workflow
    And complaints agent output is displayed
    Then complaint reference should be displayed correctly in complaints workflow
    And the complaints workflow fact find should match the aggregated payload
    And the complaints workflow A2UI rendered UI should match the agent contract:
      | section   |
      | fact_find |
    Examples:
      | complaintRef |
      | NC10010449   |
