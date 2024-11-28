function linkerd_viz.cleanup {
    helm uninstall linkerd-viz --namespace linkerd-viz
    kubectl delete namespace linkerd-viz
}
function linkerd_viz.install {
    OPTIND=1
    local CERT_MANAGER_ENABLED="false"
    while getopts "c:" opt; do
        case $opt in
            c) CERT_MANAGER_ENABLED="$OPTARG" ;;
            *) echo "Invalid option: -$OPTARG" >&2; return 1 ;;
        esac
    done

    linkerd_viz.generate_certificates
    if [ $? -ne 0 ]; then
        return 1
    fi

    helm repo add linkerd-edge https://helm.linkerd.io/edge
    helm repo update
    if [ "$CERT_MANAGER_ENABLED" == false ]; then
        helm upgrade --install linkerd-viz linkerd-edge/linkerd-viz \
            --values ./kubernetes/helm/linkerd-viz/values.yaml \
            --set tap.enabled=true \
            --set tap.externalSecret=true \
            --set-file tap.crtPEM=./certificates/tap.crt \
            --set-file tap.keyPEM=./certificates/tap.key \
            --set-file tap.caBundle=./certificates/ca.crt \
            --create-namespace \
            --namespace linkerd-viz
    else
        helm upgrade --install linkerd-viz linkerd-edge/linkerd-viz \
            --values ./kubernetes/helm/linkerd-viz/values.yaml \
            --set tap.enabled=true \
            --set tap.externalSecret=true \
            --set tap.injectCaFrom=linkerd-viz/tap \
            --set tapInjector.externalSecret=true \
            --set tapInjector.injectCaFrom=linkerd-viz/linkerd-tap-injector \
            --create-namespace \
            --namespace linkerd-viz
        linkerd_viz.deploy_cert_manager_resources
        kubectl rollout restart deployment --namespace linkerd-viz
    fi

    # kubectl delete secret tls tap-k8s-tls --namespace=linkerd-viz --ignore-not-found
    # kubectl create secret tls tap-k8s-tls \
    #     --namespace=linkerd-viz \
    #     --cert=./certificates/tap.crt \
    #     --key=./certificates/tap.key

    kubectl rollout restart deployment --namespace=linkerd-viz tap
    kubectl rollout restart deployment --namespace=linkerd-viz tap-injector
}
# ---------------------------------------------------------
# Internal Functions
# ---------------------------------------------------------
function linkerd_viz.generate_certificates {
    step certificate create tap.linkerd-viz.svc ./certificates/tap.crt ./certificates/tap.key \
            --ca ./certificates/ca.crt \
            --ca-key ./certificates/ca.key \
            --san tap.linkerd-viz.svc \
            --profile leaf \
            --not-after 43800h \
            --no-password \
            --insecure \
            --force 
    if [ $? -ne 0 ]; then
        return 1
    fi
}
function linkerd_viz.deploy_cert_manager_resources {
    kubectl delete secret linkerd-trust-anchor --namespace=linkerd-viz --ignore-not-found
    kubectl create secret tls linkerd-trust-anchor \
        --cert=./certificates/ca.crt \
        --key=./certificates/ca.key \
        --namespace=linkerd-viz   
    kubectl delete -f ./kubernetes/manifests/linkerd/cert-manager-cert-viz.yaml --ignore-not-found
    kubectl apply -f ./kubernetes/manifests/linkerd/cert-manager-cert-viz.yaml
}