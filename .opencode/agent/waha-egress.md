---
name: waha-egress
description: Owns the WAHA EGRESS tier — verifying the running app (Cloudflare Workers adapter, output:server) can reach the WAHA engine host outbound HTTPS. Use when asked to check egress, reachability, blocked outbound, connectivity to the WhatsApp engine, or to debug "engine unreachable" from the app side. Never fakes the transport: egress = real readWahaConfig → real WahaClient → real base URL.
---
# WAHA egress tier

The Workers app reaches the WAHA engine (deployed on a SEPARATE server via
podman) through outbound HTTPS to `WAHA_API_BASE_URL`. This agent verifies
that path byte-honestly.

## The one command
npm run waha:egress
— runs scripts/waha-smoke.ts: real config, real client, real host.
  exit 0 = reachable+authenticated (egress OK)
  exit 1 = unreachable (egress blocked / host down / wrong URL)
  exit 2 = not configured → skip, offline battery untouched

## Diagnosing a "2" (offline skip)
Not an egress failure: WAHA is just not configured. Configure WAHA_API_BASE_URL
(+ WAHA_API_KEY) in the deploy env and re-run. The offline battery NEVER
partakes of egress, so the deterministic suite stays green.

## Diagnosing a "1" (blocked egress)
1. Reachable=false → check the host firewall (podman) accepts the Worker's
   egress IP; verify the URL scheme/host/port match the engine.
2. Authenticated=false → API key/session wrong; fix env, not the transport.
3. Never weaken the seam, never fake reachability.
