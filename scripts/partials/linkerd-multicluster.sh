function linkerd-multicluster.install {
    helm repo add linkerd-edge https://charts.linkerd.io/edge
    helm repo update
    helm upgrade --install multicluster linkerd-edge/linkerd-multicluster \
        --values ./helm/linkerd-multicluster/values.yaml \
        --create-namespace \
        --namespace linkerd-multicluster
}
function linkerd-multicluster.link {
    OPTIND=1
    local LOCAL_CONTEXT_NAME=""
    local REMOTE_CONTEXT_NAME=""
    local GATEWAY_TYPE="LoadBalancer"
    local GATEWAY_ADDRESSES=""
    local GATEWAY_PORT=""
    while getopts "l:r:t:a:p:" opt; do
        case $opt in
            l) LOCAL_CONTEXT_NAME="$OPTARG" ;;
            r) REMOTE_CONTEXT_NAME="$OPTARG" ;;
            t) GATEWAY_TYPE="$OPTARG" ;;
            a) GATEWAY_ADDRESSES="$OPTARG" ;;
            p) GATEWAY_PORT="$OPTARG" ;;
            *) echo "Invalid option: -$OPTARG" >&2; return 1 ;;
        esac
    done
   
    if [ -z "$LOCAL_CONTEXT_NAME" ] || [ -z "$REMOTE_CONTEXT_NAME" ]; then
        return 1
    fi
    
    if [ "$GATEWAY_TYPE" == "LoadBalancer" ]; then
        linkerd multicluster link \
            --context="$REMOTE_CONTEXT_NAME" \
            --cluster-name="$REMOTE_CONTEXT_NAME" | kubectl --context="$LOCAL_CONTEXT_NAME" apply --filename -
    else
        linkerd multicluster link \
            --context="$REMOTE_CONTEXT_NAME" \
            --cluster-name="$REMOTE_CONTEXT_NAME" \
            --gateway-addresses="$GATEWAY_ADDRESSES" \
            --gateway-port="$GATEWAY_PORT" | kubectl --context="$LOCAL_CONTEXT_NAME" apply --filename -
    fi
}