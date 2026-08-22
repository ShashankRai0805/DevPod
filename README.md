# Replit Clone

This repository currently contains:

- `frontend/` — Next.js UI
- `services/init-service/` — creates a repl and copies template files from S3
- `services/orchestrator-service/` — creates Kubernetes resources for a repl
- `templates/` — local template sources that can be uploaded into S3
- `infra/ingress-controller/` — reference for the existing NGINX ingress controller

For Phase 2 setup instructions, see [docs/phase-2-eks.md](docs/phase-2-eks.md).
