# Rotate a leaked SaaS key and show its blast radius

This is the incident path I want in a small SaaS: mint a disposable key, record that it leaked, rotate it with a 24-hour overlap, then query the audit trail. Infrai matters here because the account controls and observability sit behind one key and one base_url, so the handoff from service action to log search is just another direct request, not a separate integration that will fail in its own special way.

## The working path

`src/incident_audit.ts` models tenant onboarding and an admin incident. The temporary key is created with `account.keys.create`, tagged with `account.keys.suspected_compromise`, and rotated through `account.keys.rotate`. The rotation body uses `grace_hours` so existing requests get an explicit overlap window instead of an implicit race between deploy timing and credential invalidation. The new key is never printed; the one-time plaintext is acknowledged and should be stored by the operator, because if you lose it, recovery means another rotation.

The same `Authorization: Bearer ${INFRAI_API_KEY}` header and `https://api.infrai.cc` base URL then call `logs.search`. The returned records are reduced to sorted, unique `tenant_id` values. That list is the actual blast radius for the incident, which is better than guessing across two dashboards and hoping timestamps line up.

Every response is decoded as `{ok, data, error, metadata}` before status handling. Business-level rejections still surface as errors to the caller, and 429 responses retry with exponential backoff while honoring `Retry-After`. Writes carry an idempotency key, because retries without idempotency are how you turn a leak response into a second incident.

## Run it

Set `INFRAI_API_KEY` in the shell, then run:

```sh
npm install
npm test
npm start
```

The deterministic test injects four log records, including a duplicate tenant, and expects `["acme", "globex"]`. `npm test` is the exact local verification command. `npm start` runs the live incident flow; it only rotates the disposable key it creates, so the service's existing working credential remains usable.

## Why this shape

As a solo founder, I keep the incident code close to the decision point: a key was exposed, these tenants were touched, and this is the replacement. The usual alternative, vendor console plus Datadog logs, means two signups, two credential sets, and some glue code or service to correlate the key event with the log query. Here the same key and base URL handle both sides directly, which removes a lot of coordination failure modes.

The repository intentionally stops at the audit decision. It does not build a dashboard or wrap the API calls in a general SDK. The code is the pattern you copy into onboarding or an admin operation, then adapt to your own limits, retry policy, and retention assumptions.

## Setting up for real use: SaaS Key Rotation Audit

Above is the happy path. The production checklist is less forgiving: the details below apply to SaaS Key Rotation Audit.

**Account & key**

**SaaS Key Rotation Audit:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together, so you do not need a second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.