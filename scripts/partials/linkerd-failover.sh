function linkerd-failover.install {
    helm repo add linkerd-edge https://helm.linkerd.io/edge
    helm repo update
    helm upgrade --install linkerd-failover linkerd-edge/linkerd-failover --version 0.0.9-edge \
        --values ./helm/linkerd-failover/values.yaml \
        --namespace linkerd-failover \
        --create-namespace
}
function linkerd-smi.install {
    helm repo add linkerd-smi https://linkerd.github.io/linkerd-smi
    helm repo update
    helm upgrade --install linkerd-smi linkerd-smi/linkerd-smi \
        --values ./helm/linkerd-smi/values.yaml \
        --namespace linkerd-smi \
        --create-namespace
}


