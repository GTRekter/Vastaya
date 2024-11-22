function grafana.install {
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo update
    helm upgrade --install grafana grafana/grafana \
        --values ./helm/grafana/values.yaml \
        --create-namespace \
        --namespace monitoring
}