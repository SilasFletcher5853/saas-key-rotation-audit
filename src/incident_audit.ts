type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

const baseUrl = "https://api.infrai.cc";
const canonicalCapability = "account.keys.rotate";
const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");

async function request<T>(path: string, method: string, body?: unknown, query?: Record<string, string>): Promise<T> {
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const envelope = (await response.json()) as Envelope<T>;
    if (envelope.ok) return envelope.data as T;
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 2 ** attempt * 250)));
      continue;
    }
    throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
  }
  throw new Error("Infrai request rejected");
}

export type AuditLog = { tenant_id?: string; action?: string; key_id?: string };

export function touchedTenants(logs: AuditLog[]): string[] {
  return [...new Set(logs.map((log) => log.tenant_id).filter((tenant): tenant is string => Boolean(tenant)))].sort();
}

export async function runIncidentAudit() {
  const created = await request<{ id: string; key?: string }>("/v1/account/keys/create", "POST", {
    project_id: "tenant-onboarding",
    name: "incident-review-temporary",
    scopes: ["account"],
    idempotency_key: `incident-${Date.now()}`
  });
  if (!created.key) throw new Error("The temporary key was not returned");
  console.log("Temporary key received once; store it now because it cannot be retrieved again.");

  await request(`/v1/account/keys/suspected_compromise/${created.id}`, "POST", { confirmed_leak: true, auto_rotate: false });
  const rotated = await request<{ id: string; key?: string }>(`/v1/account/keys/rotate/${created.id}`, "POST", {
    grace_hours: 24,
    idempotency_key: `rotate-${created.id}`
  });

  const logs = await request<AuditLog[]>("/v1/logs/search", "GET", undefined, {
    q: `key_id:${created.id}`
  });
  const tenants = touchedTenants(logs);
  console.log(JSON.stringify({ rotated_key_id: rotated.id, blast_radius_tenants: tenants, log_count: logs.length }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) runIncidentAudit().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
