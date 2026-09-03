import type { Page, Route } from "@playwright/test";

/**
 * Provide the ADK trace to the page without hitting a live agent.
 * Hive teams can keep this helper and point the glob at their real ADK host.
 */
export async function mockAdkTrace(page: Page, trace: unknown): Promise<void> {
  await page.route("**/adk-trace", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(trace),
    });
  });
}

export async function fetchMockedAdkTrace(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const response = await fetch("/adk-trace");
    return response.json();
  });
}
