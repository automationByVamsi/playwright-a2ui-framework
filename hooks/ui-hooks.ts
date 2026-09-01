import path from "node:path";
import { After } from "../step-definitions/ui/ui-fixtures.js";

After(async function () {
  const result = this.lastValidationResult;
  const testInfo = this.testInfo;
  if (!result || !testInfo) return;
  await testInfo.attach("a2ui-validation.json", {
    body: Buffer.from(JSON.stringify(result, null, 2)),
    contentType: "application/json",
  });
  if (result.evidence.screenshot) {
    try {
      await testInfo.attach("a2ui-rendered.png", {
        path: path.resolve(result.evidence.screenshot),
        contentType: "image/png",
      });
    } catch {
      // Screenshot may be missing if extract failed before capture.
    }
  }
});
