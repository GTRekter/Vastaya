function argo.cleanup {
    uninstall_helm_release argo
    uninstall_helm_release argo-rollouts
}
function argo.install {
    helm repo add argo https://argoproj.github.io/argo-helm
    helm repo update
    helm upgrade --install argo oci://ghcr.io/argoproj/argo-helm/argo-cd \
        --values ./kubernetes/helm/argo-cd/values.yaml \
        --create-namespace \
        --namespace argo-cd 
    helm upgrade --install argo argo/argo-rollouts \
        --values ./kubernetes/helm/argo-rollouts/values.yaml \
        --create-namespace \
        --namespace argo-rollouts
}