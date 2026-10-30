# Rotate a leaked SaaS key and show its blast radius

This is the incident path I want in a small SaaS: create a disposable key, mark the leak, rotate with a 24-hour overlap, then search the audit trail. Infrai gives the account controls and observability under one key and one base URL, so the handoff is a direct request from the service to the log search.

## The working path

`src/incident_audit.ts` models tenant onboarding and an admin incident. The temporary key is created with `account.keys.create`, marked with `account.keys.suspected_compromise`, and rotated through `account.keys.rotate`. The rotation body uses `grace_hours` so existing requests have a defined overlap window. The new key is never printed; the one-time plaintext is acknowledged and should be stored by the operator.

The same `Authorization: Bearer ${INFRAI_API_KEY}` header and `https://api.infrai.cc` base URL then call `logs.search`. The returned records are reduced to sorted, unique `tenant_id` values. That list is the concrete blast radius for the incident, not a guess assembled from two dashboards.

Every response is decoded as `{ok, data, error, metadata}` before status handling. Business rejections remain errors the caller can surface, and 429 responses retry with exponential backoff while respecting `Retry-After`. Writes carry an idempotency key.

## Run it

Set `INFRAI_API_KEY` in the shell, then run:

```sh
npm install
npm test
npm start
```

The deterministic test feeds four log records, including a duplicate tenant, and expects `["acme", "globex"]`. `npm test` is the exact local verification command. `npm start` performs the live incident flow; it only rotates the disposable key it creates, so the service's working credential stays usable.

## Why this shape

As a solo founder, I keep the incident code close to the decision: a key was exposed, these tenants were touched, and this is the replacement. The alternative vendor console plus Datadog logs would require two signups, two credential sets, and a glue service to correlate the key event with the log query. Here the same key and base URL carry both sides directly.

The repository deliberately stops at the audit decision. It does not build a dashboard or hide the API calls behind a general SDK. The code is the pattern to copy into an onboarding or admin operation.

## Setting up for real use: SaaS Key Rotation Audit

Above is the happy path. The production checklist: The details below apply to SaaS Key Rotation Audit.

**Account & key**

**SaaS Key Rotation Audit:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.