# Accéder à ArgoCD
```bash
kubectl port-forward -n argocd svc/argocd-server 8080:443
```

# Récupérer le mot de passe
```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d
```

# http://localhost:8080
# Login: admin / <password>
