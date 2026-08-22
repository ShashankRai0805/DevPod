# Phase 2 — EKS, Orchestrator, and Workload Identity Setup

This phase adds an Orchestrator Service that creates a Kubernetes Deployment, Service, and Ingress for each repl. The pod uses an initContainer to copy S3 project files into `/workspace` before the main container starts.

## What is included

- Frontend redirect to `/repl/:replId`
- Orchestrator Service at `services/orchestrator-service/`
- Kubernetes manifest template at `services/orchestrator-service/k8s/service.yaml`
- Ingress controller reference at `infra/ingress-controller/ingress-nginx-controller.yaml`

## What is not included yet

- Runner service
- Monaco editor
- Terminal / PTY / xterm.js
- WebSockets
- Code execution pipeline

## Recommended AWS / EKS setup

### 1) Create or use an EKS cluster

- Pick the same AWS region as your S3 bucket when possible.
- Ensure worker nodes can pull public images such as `amazon/aws-cli` and `python:3.12-alpine`.
- Verify your cluster has the AWS Load Balancer Controller or the existing ingress-nginx controller already installed.

### 2) Confirm ingress-nginx is installed

The cluster must already have an NGINX ingress controller running.

- The controller should expose an `IngressClass` named `nginx`.
- The app-created Ingress resources must set `ingressClassName: nginx`.
- Do not install a second controller for this phase.

If you need a reference for the class name, see `infra/ingress-controller/ingress-nginx-controller.yaml`.

### 3) Create the app namespace

Use the same namespace everywhere, for example `replit`.

```bash
kubectl create namespace replit
```

### 4) Create IAM role for pod access to S3

Prefer IAM Roles for Service Accounts (IRSA) over static AWS keys.

- Create an IAM role that trusts the EKS OIDC provider.
- Attach a least-privilege S3 policy for your bucket.
- Annotate the repl service account with the role ARN.

Example policy scope:

- `s3:ListBucket` on `arn:aws:s3:::my-replit-projects`
- `s3:GetObject` on `arn:aws:s3:::my-replit-projects/templates/*`
- `s3:GetObject` on `arn:aws:s3:::my-replit-projects/users/*`
- `s3:PutObject` on `arn:aws:s3:::my-replit-projects/users/*`

### 5) Create the S3 bucket and upload templates

- Bucket example: `my-replit-projects`
- Objects:
  - `templates/node/package.json`
  - `templates/node/src/index.js`
  - `templates/python/main.py`
  - `templates/java/Main.java`
  - `templates/cpp/main.cpp`

### 6) Configure the Orchestrator Service

Set these environment variables:

```env
ORCHESTRATOR_PORT=4100
FRONTEND_URL=http://localhost:3000
K8S_NAMESPACE=replit
S3_BUCKET_NAME=my-replit-projects
AWS_REGION=ap-south-1
REPL_BASE_DOMAIN=your-repl-domain.example.com
REPL_WORKLOAD_ROLE_ARN=arn:aws:iam::<account-id>:role/<irsa-role>
```

### 7) Expose the Orchestrator API locally

- Frontend calls `POST /api/repls/:replId/start`.
- Frontend polls `GET /api/repls/:replId/status` every 1.5 seconds.

### 8) DNS and ingress

- Create a wildcard DNS record for your repl base domain if you want real browser routing later.
- Example: `*.your-repl-domain.example.com` -> NGINX LoadBalancer.
- For this phase the Ingress object is created and becomes ready once DNS and controller are configured.

### 9) Verify workload identity

The pod initContainer uses the AWS CLI image and relies on the pod identity / IRSA role.

- No AWS credentials are baked into images.
- Do not place `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` in the deployment template.
- In production, the pod should receive permissions from the attached IAM role.

### 10) Test end-to-end

1. Open the frontend.
2. Create a repl.
3. Confirm redirect to `/repl/:replId`.
4. Confirm the Orchestrator starts provisioning.
5. Confirm the Deployment, Service, and Ingress objects are created in Kubernetes.
6. Confirm the pod initContainer downloads the project from S3.
7. Confirm the frontend reaches the ready state.
