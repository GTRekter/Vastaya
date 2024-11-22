function linkerd.cleanup {
    # log_message "INFO" "Linkerd is not enabled. Skipping Linkerd setup."
    # kubectl delete secret linkerd-identity-issuer --namespace=linkerd --ignore-not-found
    # TODO: the CRDs might not exist
    # CERT_CONTENT=$(cat ./certificates/ca.crt | sed 's/^/          /')
    # awk -v cert="$CERT_CONTENT" -v license="$BUOYANT_LICENSE" '{gsub(/PLACEHOLDER_CERTIFICATE/, cert); gsub(/PLACEHOLDER_LICENSE/, license)}1' ./manifests/linkerd/linkerd-operator-control-plane.yaml | kubectl delete --ignore-not-found --filename - 
    uninstall_helm_release linkerd-buoyant
    uninstall_helm_release linkerd-control-plane
    uninstall_helm_release linkerd-crds
    uninstall_helm_release linkerd-enterprise-control-plane
    uninstall_helm_release linkerd-enterprise-crds
}
function linkerd.install {
    OPTIND=1
    local BUOYANT_OPERATOR="false"
    local BUOYANT_LICENSE=""
    local BUOYANT_CLOUD_ENABLED="false"
    local BUOYANT_CLOUD_API_CLIENT_ID=""
    local BUOYANT_CLOUD_API_CLIENT_SECRET=""
    local BUOYANT_AGENT_NAME="linkerd-agent"
    local CERT_MANAGER_ENABLED="false"
    local LINKERD_VERSION="2.16.2"
    while getopts "o:l:e:i:s:a:c:v:" opt; do
        case $opt in
            o) BUOYANT_OPERATOR="$OPTARG" ;;
            l) BUOYANT_LICENSE="$OPTARG" ;; 
            e) BUOYANT_CLOUD_ENABLED="$OPTARG" ;;
            i) BUOYANT_CLOUD_API_CLIENT_ID="$OPTARG" ;;
            s) BUOYANT_CLOUD_API_CLIENT_SECRET="$OPTARG" ;;
            a) BUOYANT_AGENT_NAME="$OPTARG" ;;
            c) CERT_MANAGER_ENABLED="$OPTARG" ;;
            v) LINKERD_VERSION="$OPTARG" ;;
            *) echo "Invalid option: -$OPTARG" >&2; return 1 ;;
        esac
    done

    generate_certificates
    if [ $? -ne 0 ]; then
        return 1
    fi

    if [ "$BUOYANT_OPERATOR" == true ]; then
        install_operator -l "$BUOYANT_LICENSE" -e "$BUOYANT_CLOUD_ENABLED" -i "$BUOYANT_CLOUD_API_CLIENT_ID" -s "$BUOYANT_CLOUD_API_CLIENT_SECRET" -a "$BUOYANT_AGENT_NAME" -v "$LINKERD_VERSION"
    else 
        LINKERD_ENTERPRISE=true
        # echo "Checking if Linkerd Enterprise $LINKERD_VERSION is available..."
        is_enterprise -v $LINKERD_VERSION
        if [ $? -ne 0 ]; then
        #     echo "Linkerd Enterprise $LINKERD_VERSION is not available. Installing Linkerd Edge instead."
        #     is_edge -v $LINKERD_VERSION
        #     if [ $? -ne 0 ]; then
        #         echo "Linkerd Edge $LINKERD_VERSION is not available. Exiting..."
        #         exit 1
        #     else 
                LINKERD_ENTERPRISE=false
        #     fi
        fi
        if [ "$LINKERD_ENTERPRISE" == true ]; then
            install_enterprise -l "$BUOYANT_LICENSE" -e "$BUOYANT_CLOUD_ENABLED" -i "$BUOYANT_CLOUD_API_CLIENT_ID" -s "$BUOYANT_CLOUD_API_CLIENT_SECRET" -a "$BUOYANT_AGENT_NAME" -c "$CERT_MANAGER_ENABLED" -v "$LINKERD_VERSION"
        else
            install_edge -c "$CERT_MANAGER_ENABLED" -v "$LINKERD_VERSION"
        fi
    fi
    

}
function linkerd.inject {
    OPTIND=1
    local NAMESPACE=""
    local DEPLOYMENT=""
    while getopts "n:d:" opt; do
        case $opt in
            n) NAMESPACE="$OPTARG" ;;
            d) DEPLOYMENT="$OPTARG" ;; 
            *) echo "Invalid option: -$OPTARG" >&2; return 1 ;;
        esac
    done
    kubectl wait --for=condition=available \
        --timeout=300s deploy \
        --namespace=linkerd \
        linkerd-proxy-injector 
    kubectl wait --for=condition=available \
        --timeout=300s deploy \
        --namespace=linkerd \
        linkerd-identity
    kubectl wait --for=condition=available \
        --timeout=300s deploy \
        --namespace=linkerd \
        linkerd-destination
    kubectl patch deployment "$DEPLOYMENT" \
        --namespace "$NAMESPACE" \
        -p '{"spec":{"template":{"metadata":{"annotations":{"linkerd.io/inject":"enabled"}}}}}'
    kubectl rollout restart deployment "$DEPLOYMENT" --namespace "$NAMESPACE"
}
function linkerd.inject_debug_container {
    OPTIND=1
    local NAMESPACE=""
    local DEPLOYMENT=""
    while getopts "n:d:" opt; do
        case $opt in
            n) NAMESPACE="$OPTARG" ;;
            d) DEPLOYMENT="$OPTARG" ;; 
            *) echo "Invalid option: -$OPTARG" >&2; return 1 ;;
        esac
    done
    kubectl wait --for=condition=available \
        --timeout=300s deploy \
        --namespace=linkerd \
        linkerd-proxy-injector 
    kubectl wait --for=condition=available \
        --timeout=300s deploy \
        --namespace=linkerd \
        linkerd-identity
    kubectl wait --for=condition=available \
        --timeout=300s deploy \
        --namespace=linkerd \
        linkerd-destination
    kubectl patch deployment "$DEPLOYMENT" \
        --namespace "$NAMESPACE" \
        -p '{"spec":{"template":{"metadata":{"annotations":{"config.linkerd.io/enable-debug-sidecar":"true"}}}}}'
    kubectl rollout restart deployment "$DEPLOYMENT" --namespace "$NAMESPACE"

}
function linkerd.remove_all_injections {
    NAMESPACES=$(kubectl get namespaces --output jsonpath='{.items[*].metadata.name}' | tr ' ' '\n' | grep --invert-match 'linkerd')
    for NAMESPACE in $NAMESPACES; do
        for DEPLOYMENT in $(kubectl get deployments --namespace "$NAMESPACE" --output jsonpath='{.items[*].metadata.name}'); do
            ANNOTATION=$(kubectl get deployment "$DEPLOYMENT" --namespace "$NAMESPACE" --output jsonpath='{.spec.template.metadata.annotations.linkerd\.io/inject}' 2>/dev/null)
            if [[ "$ANNOTATION" == "enabled" ]]; then
                kubectl patch deployment "$DEPLOYMENT" --namespace "$NAMESPACE" --type=json --patch='[{"op": "remove", "path": "/spec/template/metadata/annotations/linkerd.io~1inject"}]'
                # log_message "INFO" "kubectl patch deployment $DEPLOYMENT -n $NAMESPACE --type=json -p='[{\"op\": \"add\", \"path\": \"/spec/template/metadata/annotations/linkerd.io~1inject\", \"value\": \"enabled\"}]'"
            fi
        done
    done
}
function linkerd.deploy_http_route {
    kubectl apply -f ./manifests/linkerd/httproute-gateway.yaml
}
# ---------------------------------------------------------
# Internal Functions
# ---------------------------------------------------------
function generate_certificates {
    rm -rf ./certificates
    mkdir -p ./certificates
    if [ $? -ne 0 ]; then
        return 1
    fi
    step certificate create root.linkerd.cluster.local ./certificates/ca.crt ./certificates/ca.key \
        --profile root-ca \
        --no-password \
        --insecure \
        --force 
    if [ $? -ne 0 ]; then
        return 1
    fi
    step certificate create identity.linkerd.cluster.local ./certificates/issuer.crt ./certificates/issuer.key \
        --ca ./certificates/ca.crt \
        --ca-key ./certificates/ca.key \
        --profile intermediate-ca \
        --not-after 8760h \
        --no-password \
        --insecure \
        --force 
    if [ $? -ne 0 ]; then
        return 1
    fi
}
function is_enterprise {
    OPTIND=1
    local VERSION=""
    while getopts "v:" opt; do
        case $opt in
            v) VERSION="$OPTARG" ;;
            *) echo "Invalid option: -$OPTARG" >&2; return 1 ;;
        esac
    done
    local VERSIONS=$(curl --silent "https://artifacthub.io/api/v1/packages/helm/linkerd-buoyant/linkerd-enterprise-control-plane" | jq --raw-output '.available_versions[].version')
    if [ $? -ne 0 ] || [ -z "$VERSIONS" ]; then
        return 1
    fi
    if echo "$VERSIONS" | grep --quiet "^$VERSION$"; then
        return 0
    else
        return 1
    fi
}
function is_edge {
    OPTIND=1
    local VERSION=""
    while getopts "v:" opt; do
        case $opt in
            v) VERSION="$OPTARG" ;;
            *) echo "Invalid option: -$OPTARG" >&2; return 1 ;;
        esac
    done
    local VERSIONS=$(curl --silent "https://artifacthub.io/api/v1/packages/helm/linkerd2-edge/linkerd-control-plane" | jq --raw-output '.available_versions[].version')
    if [ $? -ne 0 ] || [ -z "$VERSIONS" ]; then
        return 1
    fi
    if echo "$VERSIONS" | grep --quiet "^$VERSION$"; then
        return 0
    else
        return 1
    fi
}
function install_cli {
    OPTIND=1
    local LINKERD_ENTERPRISE=""
    while getopts "e:" opt; do
        case $opt in
            e) LINKERD_ENTERPRISE="$OPTARG" ;;
            *) echo "Invalid option: -$OPTARG" >&2; return 1 ;;
        esac
    done
    if [ "$LINKERD_ENTERPRISE" == true ]; then
        curl --proto '=https' --tlsv1.2 --silent --show-error --fail --location https://enterprise.buoyant.io/install | sh
    else
        curl --proto '=https' --tlsv1.2 --silent --show-error --fail --location https://run.linkerd.io/install | sh
    fi
    export PATH="$HOME/.linkerd2/bin:$PATH"
}
function install_operator {
    OPTIND=1
    local BUOYANT_LICENSE=""
    local BUOYANT_CLOUD_ENABLED="false"
    local BUOYANT_CLOUD_API_CLIENT_ID=""
    local BUOYANT_CLOUD_API_CLIENT_SECRET=""
    local BUOYANT_AGENT_NAME="linkerd-agent"
    # local CERT_MANAGER_ENABLED="false" # TODO: implement it
    local LINKERD_VERSION="2.16.2"
    while getopts "l:e:i:s:a:v:" opt; do
        case $opt in
            l) BUOYANT_LICENSE="$OPTARG" ;;
            e) BUOYANT_CLOUD_ENABLED="$OPTARG" ;;
            i) BUOYANT_CLOUD_API_CLIENT_ID="$OPTARG" ;;
            s) BUOYANT_CLOUD_API_CLIENT_SECRET="$OPTARG" ;;
            a) BUOYANT_AGENT_NAME="$OPTARG" ;;
            # c) CERT_MANAGER_ENABLED="$OPTARG" ;;
            v) LINKERD_VERSION="$OPTARG" ;;
            *) echo "Invalid option: -$OPTARG" >&2; return 1 ;;
        esac
    done
    if [ -z "$BUOYANT_LICENSE" ] || { [ "$BUOYANT_CLOUD_ENABLED" == true ] && { [ -z "$BUOYANT_CLOUD_API_CLIENT_ID" ] || [ -z "$BUOYANT_CLOUD_API_CLIENT_SECRET" ]; }; }; then
        # log_message "ERROR" "Buoyant Cloud is enabled but the API client ID and secret are not provided."
        exit 1
    fi
    if [ "$BUOYANT_CLOUD_ENABLED" == false ]; then
        helm upgrade --install linkerd-buoyant linkerd-buoyant/linkerd-buoyant \
            --set buoyantCloudEnabled=false \
            --set license="$BUOYANT_LICENSE" \
            --namespace linkerd-buoyant \
            --create-namespace
    else
        helm upgrade --install linkerd-buoyant linkerd-buoyant/linkerd-buoyant \
            --set buoyantCloudEnabled=true \
            --set metadata.agentName="$BUOYANT_AGENT_NAME" \
            --set api.clientID="$API_CLIENT_ID" \
            --set api.clientSecret="$API_CLIENT_SECRET" \
            --set license="$BUOYANT_LICENSE" \
            --namespace linkerd-buoyant \
            --create-namespace
    fi
    kubectl delete secret linkerd-identity-issuer --namespace=linkerd --ignore-not-found
    kubectl create secret generic linkerd-identity-issuer \
        --namespace=linkerd \
        --from-file=ca.crt=./certificates/ca.crt \
        --from-file=tls.crt=./certificates/issuer.crt \
        --from-file=tls.key=./certificates/issuer.key
    CERT_CONTENT=$(sed 's/^/          /' ./certificates/ca.crt)
    awk -v version="enterprise-$LINKERD_VERSION" -v cert="$CERT_CONTENT" -v license="$BUOYANT_LICENSE" \
        '{gsub(/PLACEHOLDER_VERSION/, version); gsub(/PLACEHOLDER_CERTIFICATE/, cert); gsub(/PLACEHOLDER_LICENSE/, license)}1' \
        ./manifests/linkerd/linkerd-operator-control-plane.yaml | kubectl delete --ignore-not-found --filename - 
    kubectl wait --for=condition=available \
        --timeout=300s deployment \
        --namespace=linkerd-buoyant \
        linkerd-control-plane-operator 
    kubectl wait --for=condition=available \
        --timeout=300s deployment \
        --namespace=linkerd-buoyant \
        linkerd-control-plane-validator
    kubectl wait --for=condition=available \
        --timeout=300s deployment \
        --namespace=linkerd-buoyant \
        linkerd-data-plane-operator
    sleep 5
    awk -v version="enterprise-$LINKERD_VERSION" -v cert="$CERT_CONTENT" -v license="$BUOYANT_LICENSE" \
        '{gsub(/PLACEHOLDER_VERSION/, version); gsub(/PLACEHOLDER_CERTIFICATE/, cert); gsub(/PLACEHOLDER_LICENSE/, license)}1' \
        ./manifests/linkerd/linkerd-operator-control-plane.yaml | kubectl apply --filename -
}
function install_enterprise {
    OPTIND=1
    local BUOYANT_LICENSE=""
    local BUOYANT_CLOUD_ENABLED="false"
    local BUOYANT_CLOUD_API_CLIENT_ID=""
    local BUOYANT_CLOUD_API_CLIENT_SECRET=""
    local BUOYANT_AGENT_NAME="linkerd-agent"
    local CERT_MANAGER_ENABLED="false"
    local LINKERD_VERSION="2.16.2"
    while getopts "l:e:i:s:a:c:v:" opt; do
        case $opt in
            l) BUOYANT_LICENSE="$OPTARG" ;;
            e) BUOYANT_CLOUD_ENABLED="$OPTARG" ;;
            i) BUOYANT_CLOUD_API_CLIENT_ID="$OPTARG" ;;
            s) BUOYANT_CLOUD_API_CLIENT_SECRET="$OPTARG" ;;
            a) BUOYANT_AGENT_NAME="$OPTARG" ;;
            c) CERT_MANAGER_ENABLED="$OPTARG" ;;
            v) LINKERD_VERSION="$OPTARG" ;;
            *) echo "Invalid option: -$OPTARG" >&2; return 1 ;;
        esac
    done
    if [ -z "$BUOYANT_LICENSE" ] || { [ "$BUOYANT_CLOUD_ENABLED" == true ] && { [ -z "$BUOYANT_CLOUD_API_CLIENT_ID" ] || [ -z "$BUOYANT_CLOUD_API_CLIENT_SECRET" ]; }; }; then
        # log_message "ERROR" "Buoyant Cloud is enabled but the API client ID and secret are not provided."
        exit 1
    fi
    helm repo add linkerd-buoyant https://helm.buoyant.cloud
    helm repo update
    helm upgrade --install linkerd-enterprise-crds linkerd-buoyant/linkerd-enterprise-crds \
        --namespace linkerd \
        --create-namespace
    if [ "$CERT_MANAGER_ENABLED" == false ]; then    
        helm upgrade --install linkerd-control-plane linkerd-buoyant/linkerd-enterprise-control-plane \
            --version "$LINKERD_VERSION" \
            --values ./helm/linkerd-enterprise/values.yaml \
            --set-file linkerd-control-plane.identityTrustAnchorsPEM=./certificates/ca.crt \
            --set-file linkerd-control-plane.identity.issuer.tls.crtPEM=./certificates/issuer.crt \
            --set-file linkerd-control-plane.identity.issuer.tls.keyPEM=./certificates/issuer.key \
            --set license="$BUOYANT_LICENSE" \
            --namespace linkerd \
            --create-namespace 
    else 
        helm upgrade --install linkerd-enterprise-control-plane linkerd-buoyant/linkerd-enterprise-control-plane \
            --version "$LINKERD_VERSION" \
            --values ./helm/linkerd-enterprise/values.yaml \
            --set-file linkerd-control-plane.identityTrustAnchorsPEM=./certificates/ca.crt \
            --set linkerd-control-plane.identity.issuer.scheme=kubernetes.io/tls \
            --set license="$BUOYANT_LICENSE" \
            --namespace linkerd \
            --create-namespace 
        deploy_cert_manager_resources
        kubectl rollout restart deployment --namespace linkerd
    fi  
    if [ "$BUOYANT_CLOUD_ENABLED" == true ]; then
        helm upgrade --install linkerd-buoyant linkerd-buoyant/linkerd-buoyant \
            --set buoyantCloudEnabled=true \
            --set metadata.agentName="$BUOYANT_AGENT_NAME" \
            --set api.clientID="$API_CLIENT_ID" \
            --set api.clientSecret="$API_CLIENT_SECRET" \
            --set license="$BUOYANT_LICENSE" \
            --set controlPlaneOperator.enabled=false \
            --namespace linkerd-buoyant \
            --create-namespace
    fi
}
function install_edge {
    OPTIND=1
    local CERT_MANAGER_ENABLED="false"
    local LINKERD_VERSION="2.16.2"
    while getopts "c:v:" opt; do
        case $opt in
            c) CERT_MANAGER_ENABLED="$OPTARG" ;;
            v) LINKERD_VERSION="$OPTARG" ;;
            *) echo "Invalid option: -$OPTARG" >&2; return 1 ;;
        esac
    done
    helm repo add linkerd-edge https://helm.linkerd.io/edge
    helm repo update
    helm upgrade --install linkerd-crds linkerd/linkerd-crds \
        --namespace linkerd-edge \
        --create-namespace
    if [ "$CERT_MANAGER_ENABLED" == false ]; then 
        helm upgrade --install linkerd-control-plane linkerd-edge/linkerd-control-plane \
            --version "$LINKERD_VERSION" \
            --set-file identityTrustAnchorsPEM=certificates/ca.crt \
            --set-file identity.issuer.tls.crtPEM=certificates/issuer.crt \
            --set-file identity.issuer.tls.keyPEM=certificates/issuer.key \
            --set runAsRoot=true \
            --namespace linkerd \
            --create-namespace 
    else
        helm upgrade --install linkerd-control-plane linkerd-edge/linkerd-control-plane \
            --version "$LINKERD_VERSION" \
            --set-file identityTrustAnchorsPEM=certificates/ca.crt \
            --set identity.issuer.scheme=kubernetes.io/tls \
            --set runAsRoot=true \
            --namespace linkerd \
            --create-namespace 
        deploy_cert_manager_resources
        kubectl rollout restart deployment --namespace linkerd
    fi  
}
function deploy_cert_manager_resources {
    kubectl delete secret linkerd-trust-anchor --namespace=linkerd --ignore-not-found
    kubectl create secret tls linkerd-trust-anchor \
        --cert=./certificates/ca.crt \
        --key=./certificates/ca.key \
        --namespace=linkerd   
    kubectl delete -f ./manifests/linkerd/cert-manager-cert.yaml --ignore-not-found
    kubectl apply -f ./manifests/linkerd/cert-manager-cert.yaml
}
