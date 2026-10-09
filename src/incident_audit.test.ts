import { strict as assert } from "node:assert";
import { touchedTenants } from "./incident_audit.js";

const result = touchedTenants([
  { tenant_id: "acme", action: "admin.login" },
  { tenant_id: "globex", action: "account.read" },
  { tenant_id: "acme", action: "billing.read" },
  { action: "health.check" }
]);
assert.deepEqual(result, ["acme", "globex"]);
console.log("blast-radius decision test passed");
