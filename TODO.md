# OCSP Responder and HA CRL Publication - ToDo

- [x] P0-1: Public CRL endpoints (latest and by number), no auth
- [x] P0-2: Publication hooks after CRL generation to push to HA endpoints (HTTP webhooks)
- [x] P0-3: Basic OCSP responder (JSON endpoint) wired to DB status
- [ ] P0-4: Wire CA config defaults for CRL DPs and OCSP URL; docs/env
- [ ] P1-1: Binary OCSP responder (application/ocsp-request/response)
- [ ] P1-2: Scheduled CRL regeneration/republish (cron) and health checks

Progress will be updated as each item completes.