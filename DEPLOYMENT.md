# Wizly Supportbot — Azure AKS Deployment Guide

## Current deployment status

| Item | Value |
|------|-------|
| Subscription | Wyzly tools |
| Resource group | superfy-utils-rg |
| AKS cluster | superfy-utils-aks |
| ACR | superfyutilsacr.azurecr.io |
| Dashboard URL | https://wizly-supportbot.westus2.cloudapp.azure.com |
| Ingress IP | 4.242.74.145 |
| TLS | Let's Encrypt (active) |
| Knowledge entries | 15 (restored from dump) |
| Admin password | see `azure-migration/wizly-supportbot.env` |
| Google OAuth | **pending** — see OAuth Setup below |

## Prerequisites (user actions)

1. **Azure subscription**: deployed under **Wyzly tools** (`438cae9b-7845-41af-9932-783cb9073ca8`). If you intended a separate "Superfy utils" subscription, create it in the portal and re-provision.
2. **Google Workspace**: sign up for Business Starter with domain `wyzly.net`, create user `support@wyzly.net`.
3. **Namecheap DNS** for `wyzly.net` (see Email Setup below).
4. **Google Cloud OAuth** client (see OAuth Setup below).

## Azure provisioning

```bash
az login
az account set --subscription "Wyzly tools"

az group create --name superfy-utils-rg --location westus2

az acr create --resource-group superfy-utils-rg --name superfyutilsacr --sku Basic

az aks create \
  --resource-group superfy-utils-rg \
  --name superfy-utils-aks \
  --node-count 1 \
  --node-vm-size Standard_D2als_v7 \
  --zones 2 \
  --attach-acr superfyutilsacr \
  --generate-ssh-keys

az aks approuting enable \
  --resource-group superfy-utils-rg \
  --name superfy-utils-aks

az aks get-credentials \
  --resource-group superfy-utils-rg \
  --name superfy-utils-aks
```

## cert-manager + Let's Encrypt

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set crds.enabled=true

kubectl apply -f k8s/cluster-issuer-letsencrypt.yaml
```

## DNS label on ingress IP

```bash
# Find the app-routing ingress public IP
kubectl get svc -n app-routing-system

# Set DNS label (if not already set by app routing)
az network public-ip update \
  -g <node-resource-group> \
  --name <ingress-public-ip-name> \
  --dns-name wizly-supportbot
```

The dashboard will be available at:
`https://wizly-supportbot.westus2.cloudapp.azure.com`

## Create Kubernetes secrets

```bash
kubectl create namespace wizly-supportbot

kubectl create secret generic wizly-supportbot-secrets \
  --namespace wizly-supportbot \
  --from-literal=ADMIN_PASSWORD='<strong-password>' \
  --from-literal=JWT_SECRET='$(openssl rand -hex 32)' \
  --from-literal=GOOGLE_CLIENT_ID='<from-google-cloud-console>' \
  --from-literal=GOOGLE_CLIENT_SECRET='<from-google-cloud-console>' \
  --from-literal=GOOGLE_REDIRECT_URI='https://wizly-supportbot.westus2.cloudapp.azure.com/api/auth/gmail/callback'
```

## Build and deploy

```bash
az acr build \
  --registry superfyutilsacr \
  --image wizly-supportbot:initial \
  ./wizly-supportbot

helm upgrade --install wizly-supportbot ./helm/wizly-supportbot \
  --namespace wizly-supportbot \
  --create-namespace \
  -f ./helm/wizly-supportbot/values-azure.yaml \
  --wait --timeout 5m
```

## Restore database dump

```bash
POD=$(kubectl get pod -n wizly-supportbot -l app=wizly-supportbot -o jsonpath='{.items[0].metadata.name}')

kubectl cp support_dump_20260715.sql wizly-supportbot/$POD:/tmp/support_dump.sql

kubectl exec -n wizly-supportbot $POD -- sh -c \
  'apk add --no-cache sqlite && sqlite3 /app/data/support.db < /tmp/support_dump.sql'
```

## Email setup — Google Workspace + Namecheap DNS

### 1. Google Workspace signup

1. Go to https://workspace.google.com and sign up for **Business Starter**.
2. Verify domain ownership with `wyzly.net`.
3. Create user: `support@wyzly.net`.

### 2. Namecheap DNS records

In Namecheap → Domain List → wyzly.net → Advanced DNS:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| TXT | @ | `google-site-verification=<code-from-google>` | Automatic |
| MX | @ | `smtp.google.com` (Priority: 1) | Automatic |
| TXT | @ | `v=spf1 include:_spf.google.com ~all` | Automatic |

After Google Workspace is active, enable DKIM in Google Admin Console → Apps → Google Workspace → Gmail → Authenticate email, then add the DKIM TXT record Google provides.

### 3. Google Cloud OAuth client

1. Go to https://console.cloud.google.com → create project (e.g. `wyzly-supportbot`).
2. Enable **Gmail API**.
3. Configure OAuth consent screen:
   - User type: **Internal** (requires Google Workspace)
   - App name: Wyzly Supportbot
   - Scopes: `gmail.readonly`, `gmail.modify`, `gmail.send`
4. Create OAuth 2.0 Client ID (Web application):
   - Authorized redirect URI: `https://wizly-supportbot.westus2.cloudapp.azure.com/api/auth/gmail/callback`
5. Update the cluster secret:

```bash
./scripts/update-google-oauth.sh <client-id> <client-secret>
```

### 4. First-run in the dashboard

1. Open `https://wizly-supportbot.westus2.cloudapp.azure.com`
2. Log in with `ADMIN_PASSWORD`
3. Settings → enter OpenAI API key
4. Settings → Connect Gmail (sign in as `support@wyzly.net`)
5. Test: send an email to `support@wyzly.net`, refresh inbox, generate + approve a reply

## GitHub Actions CI

Add these repository secrets:

| Secret | Value |
|--------|-------|
| `AZURE_CREDENTIALS` | Service principal JSON (`az ad sp create-for-rbac`) |
| `AZURE_SUBSCRIPTION_ID` | Superfy utils subscription ID |

```bash
az ad sp create-for-rbac \
  --name wizly-supportbot-deploy \
  --role contributor \
  --scopes /subscriptions/<superfy-utils-sub-id>/resourceGroups/superfy-utils-rg \
  --sdk-auth
```

Push to `main` triggers ACR build + Helm rollout automatically.
