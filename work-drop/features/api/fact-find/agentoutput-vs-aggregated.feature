@factfind-contract @apiComparison
Feature: Fact-find — agentOutput vs aggregated payload

  Compare stored agentOutput.fact_find to aggregated JSON.
  Generation of those files is out of scope for this feature.

  Scenario Outline: stored agentOutput matches aggregated payload
    When aggregated payload and agent output are loaded for "<complaintRef>"
    Then fact find in agent output should match the aggregated payload

    Examples:
      | complaintRef |
      | NC10010449   |

  Scenario: stored agentOutput matches aggregated payload for every loaded reference
    Given fact-find compare loads complaint references from the catalog
    Then fact find in agent output should match aggregated payload for every loaded reference
