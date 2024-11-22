function install_datadog {
    local DATADOG_API_KEY="${1}"
    helm repo add datadog https://helm.datadoghq.com
    helm repo update
    helm upgrade --install datadog datadog/datadog \
        --values ./helm/datadog/values.yaml \
        --create-namespace \
        --namespace datadog
    kubectl delete secret generic datadog-secret --namespace=datadog --ignore-not-found
    kubectl create secret generic datadog-secret \
        --namespace=datadog \
        --from-literal=api-key="$DATADOG_API_KEY" 
    kubectl rollout restart deploy -n datadog datadog-cluster-agent
}