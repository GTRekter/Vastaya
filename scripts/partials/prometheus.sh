function prometheus.install {
    OPTIND=1
    local LINKERD_VIZ_FEDERATION_ENABLED="false"
    while getopts "f:" opt; do
        case $opt in
            f) LINKERD_VIZ_FEDERATION_ENABLED="$OPTARG" ;;
            *) echo "Invalid option: -$OPTARG" >&2; return 1 ;;
        esac
    done

    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update
    helm upgrade -install kube-state-metrics prometheus-community/kube-state-metrics \
        --values ./kubernetes/helm/kube-state-metrics/values.yaml \
        --namespace monitoring \
        --create-namespace 
    if [ "$LINKERD_VIZ_FEDERATION_ENABLED" == true ]; then
        helm upgrade --install prometheus prometheus-community/prometheus \
        --values ./kubernetes/helm/prometheus/values-fedetation-viz.yaml \
        --namespace monitoring \
        --create-namespace   
    kubectl apply -f ./kubernetes/manifests/linkerd/prometheus-federate.yaml
    else
        helm upgrade --install prometheus prometheus-community/prometheus \
        --values ./kubernetes/helm/prometheus/values.yaml \
        --namespace monitoring \
        --create-namespace  
    fi 
}