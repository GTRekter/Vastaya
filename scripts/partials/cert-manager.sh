function cert-manager.install {
    helm repo add cert-manager https://charts.jetstack.io
    helm repo update
    helm upgrade --install cert-manager cert-manager/cert-manager \
        --values ./helm/cert-manager/values.yaml \
        --create-namespace \
        --namespace cert-manager
}