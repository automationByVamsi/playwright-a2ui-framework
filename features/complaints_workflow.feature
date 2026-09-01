Feature: Validate Complaints Workflow UI contract

  The Compare #1 gate is JSON-to-JSON. Playwright is not required for these scenarios.

  Scenario: All expected customer profiles are present in the agent contract
    Given the complaint reference "NC10010449"
    When the Complaints Workflow contract is validated
    Then validation should pass
    And the contract should contain 2 customer profiles
    And each customer's personal details should match the source data
    And the groundedness check should be "correct"

  Scenario: Missing customer in the ADK contract is an agent output failure
    Given the complaint reference "NC10010449"
    And the ADK contract is mutated to drop customer "1420289780"
    When the Complaints Workflow contract is validated
    Then validation should fail
    And the failure class should be "AGENT_OUTPUT_FAILURE"
    And the missing customer should be named "Frederick Hussain"
    And the missing party id should be "1420289780"
    And the contract path should include "fact_find.customers"
