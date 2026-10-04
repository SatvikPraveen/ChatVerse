# Kubernetes manifests

Apply in order:

```bash
kubectl apply -f infra/k8s/00-namespace.yaml
# create the real secret first (see 10-config.yaml for the key list), then:
kubectl apply -f infra/k8s/10-config.yaml   # ConfigMap (+ secret template, replace before use)
kubectl apply -f infra/k8s/20-api.yaml      # Deployment, Service, PodDisruptionBudget
kubectl apply -f infra/k8s/30-web.yaml
kubectl apply -f infra/k8s/40-ingress.yaml  # ingress-nginx + cert-manager assumed
kubectl apply -f infra/k8s/50-hpa.yaml
```

Assumptions: MongoDB and Redis are managed services reachable from the cluster (DocumentDB /
Atlas and ElastiCache in the Terraform skeleton), ingress-nginx and cert-manager are installed,
and images are published to ghcr.io by the release workflow.

Each API pod gets `NODE_ID` from its pod name; the Socket.IO Redis adapter handles fan-out
between pods, so no pod needs to know about the others.
