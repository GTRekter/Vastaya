function minikube.cleanup {
    local MINIKUBE_CLUSTERS_COUNT="${1:-1}"
    for INDEX in $(seq 1 $MINIKUBE_CLUSTERS_COUNT); do
        minikube profile "cluster-$INDEX"
        minikube delete
    done
}
function minikube.start {
    OPTIND=1
    local DRIVER="docker"
    local RUNTIME="docker"
    local NODES_COUNT=1
    local CLUSTERS_COUNT=1
    local CPUS=4
    local MEMORY=4096
    while getopts "d:r:n:c:p:m:" opt; do
        case $opt in
            d) DRIVER="$OPTARG" ;;
            r) RUNTIME="$OPTARG" ;;
            n) NODES_COUNT="$OPTARG" ;;
            c) CLUSTERS_COUNT="$OPTARG" ;;
            p) CPUS="$OPTARG" ;;
            m) MEMORY="$OPTARG" ;;
            *) echo "Invalid option: -$OPTARG" >&2; return 1 ;;
        esac
    done
    if minikube status | grep --quiet "Running"; then
        return
    fi
    local MAIN_CLUSTER_IP=""
    for INDEX in $(seq 1 "$MINIKUBE_CLUSTERS_COUNT"); do
        if [ "$INDEX" -eq 1 ]; then
            minikube start --driver="$MINIKUBE_DRIVER" \
                --container-runtime="$MINIKUBE_RUNTIME" \
                --nodes="$MINIKUBE_NODES_COUNT" \
                --cpus="$MINIKUBE_CPUS" \
                --memory="$MINIKUBE_MEMORY" \
                --addons registry \
                --network bridge \
                --profile "cluster-$INDEX"
            if [ $? -ne 0 ]; then
                return 1
            fi
            MAIN_CLUSTER_IP=$(minikube ip --profile "cluster-$INDEX")
        else
            minikube start --driver="$MINIKUBE_DRIVER" \
                --container-runtime="$MINIKUBE_RUNTIME" \
                --nodes="$MINIKUBE_NODES_COUNT" \
                --cpus="$MINIKUBE_CPUS" \
                --memory="$MINIKUBE_MEMORY" \
                --insecure-registry "$MAIN_CLUSTER_IP:5000" \
                --network bridge \
                --profile "cluster-$INDEX"
            if [ $? -ne 0 ]; then
                return 1
            fi
        fi
    done
    eval "$(minikube docker-env --unset)" # Unset if already set
    if [ "$MINIKUBE_CLUSTERS_COUNT" -gt 1 ] || [ "$MINIKUBE_NODES_COUNT" -gt 1 ]; then
        minikube profile cluster-1
        if [ $? -ne 0 ]; then
            return 1
        fi
        minikube.update_docker_insecure_registries
        echo "Here"
        kubectl port-forward --namespace kube-system service/registry 5000:80 &
        # TODO: it's not working
    else
        eval "$(minikube docker-env)"
    fi
    minikube.add_topology_label_to_nodes
    minikube.add_agentpool_label_to_nodes
}
# ---------------------------------------------------------
# Internal Functions
# ---------------------------------------------------------
function minikube.update_docker_insecure_registries {
    local NODES_COUNT=$(kubectl get nodes --no-headers -o custom-columns=":metadata.name")
    local SNAP_DOCKER_FILE="/snap/etc/docker/daemon.json"
    local DOCKER_FILE="/etc/docker/daemon.json"
    local REGISTRY_IP=$(minikube ip):5000
    if [ "$NODES_COUNT" -eq 1 ]; then
        return
    fi
    if [ ! -f "$SNAP_DOCKER_FILE" ] && [ ! -f "$DOCKER_FILE" ]; then
        sudo mkdir --parents "$(dirname "$DOCKER_FILE")"
        echo -e "{\n  \"insecure-registries\": [\"$REGISTRY_IP\"]\n}" | sudo tee "$DOCKER_FILE"
        sudo systemctl restart docker
        return
    # else
    # log_message "WARNING" "Docker configuration file already exists. Manually add $REGISTRY_IP to the insecure registries."
    fi
}
function minikube.add_topology_label_to_nodes {
    ZONE_COUNTER=1
    NODES=$(kubectl get nodes --no-headers -o custom-columns=":metadata.name")
    for NODE in $NODES; do
        ZONE_LABEL="koreacentral-$ZONE_COUNTER"
        kubectl label nodes "$NODE" topology.kubernetes.io/zone="$ZONE_LABEL" --overwrite
        ZONE_COUNTER=$((ZONE_COUNTER + 1))
    done
}
function minikube.add_agentpool_label_to_nodes {
    POOL_COUNTER=1
    NODES=$(kubectl get nodes --no-headers -o custom-columns=":metadata.name")
    NODE_COUNT=$(echo "$NODES" | wc -l)
    NODES_HALF_COUNTER=$(( (NODE_COUNT + 1) / 2 ))
    for NODE in $NODES; do
        if [ $POOL_COUNTER -le $NODES_HALF_COUNTER ]; then
            POOL_LABEL="system"
        else
            POOL_LABEL="application"
        fi
        kubectl label nodes "$NODE" agentpool="$POOL_LABEL" --overwrite
        POOL_COUNTER=$((POOL_COUNTER + 1))
    done
}