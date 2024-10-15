#!/bin/bash
set -e  
set -u  

# Load sensitive data from the settings.sh file
source "$(dirname "$0")/settings.sh"

# ---------------------------------------------------------
# Script Description
# ---------------------------------------------------------
# This Bash script automates the setup and deployment of a Kubernetes cluster, Linkerd, NGINX, Prometheus, Grafana, 
# and a sample application. The script handles multiple aspects such as Minikube cluster setup, certificate generation,
# installation of Linkerd and its enterprise features, and application deployment. Additionally, it provides functionality 
# for checking dependencies, configuring traffic simulation, and controlling the injection of Linkerd into applications.
# 
# Parameters:
# 1. MINIKUBE_ENABLED             : (optional|false) Flag to enable or disable Minikube setup. If enabled it will start a Minikube cluster, add topology labels to nodes, and update Docker insecure registries if the number of nodes is highter than 1.
# 2. MINIKUBE_DRIVER              : (docker) Specifies the Minikube driver to use (e.g., Docker, Podman).
# 3. MINIKUBE_RUNTIME             : (docker) Defines the container runtime for Minikube (e.g., Docker, CRI-O).
# 4. MINIKUBE_NODES               : (optional) Number of nodes to create in the Minikube cluster. Default is 3.
# 5. MINIKUBE_CPUS                : (optional) Number of CPUs to allocate to the Minikube cluster. Default is 8.
# 6. MINIKUBE_MEMORY              : (optional) Memory in MB to allocate to the Minikube cluster. Default is 12288.
# 7. BUOYANT_LICENSE              : License key for Linkerd Enterprise installation.
# 8. LINKERD_ENABLED              : (optional) Flag to enable or disable Linkerd installation. Default is false.
# 9. LINKERD_INJECT               : (optional) Enables Linkerd proxy injection into application deployments. Default is false.
# 10. LINKERD_ENTERPRISE          : (optional) Flag to enable Linkerd Enterprise installation. Default is false.
# 11. LINKERD_ENTERPRISE_OPERATOR : (optional) Controls whether to install the Linkerd Enterprise operator (work in progress). Default is false.
# 12. LINKERD_HTTP_ROUTE_ENABLED  : (optional) Enables HTTP route simulation for Linkerd. Default is false.
# 13. STEP_ENABLED                : (optional) Enables certificate generation using `step` CLI. Default is false.
# 14. LINKERD_VIZ_ENABLED         : (optional) Enables Linkerd Viz dashboard installation. Default is false.
# 15. PROMETHEUS_ENABLED          : (optional) Flag to enable Prometheus installation. Default is false.
# 16. GRAFANA_ENABLED             : (optional) Enables Grafana installation for monitoring. Default is false.
# 17. NGINX_ENABLED               : (optional) Flag to enable NGINX Ingress controller installation. Default is false.
# 18. APP_IMAGE_BUILD_ENABLED     : (optional) Controls whether to build the Docker images for the application. Default is false.
# 19. APP_IMAGE_DEPLOY_ENABLED    : (optional) Enables the deployment of application images to the cluster. Default is false.
# 20. APP_IMAGE_REGISTRY_LOGIN    : (optional) Indicates whether to log into the Docker registry or Azure Container Registry for pushing images. Default is false.
# 21. APP_IMAGE_REGISTRY_SERVER   : (optional) Docker registry server to which the application images will be pushed. Default is localhost:5000. 
# 22. APP_IMAGE_REGISTRY_USERNAME : (optional) Username for the Docker registry. Required if APP_IMAGE_REGISTRY_LOGIN is true.
# 23. APP_IMAGE_REGISTRY_PASSWORD : (optional) Password for the Docker registry. Required if APP_IMAGE_REGISTRY_LOGIN is true.
# 24. APP_TRAFFIC_ENABLED         : (optional) Flag to enable traffic simulation for the application. Default is false.

# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

MINIKUBE_ENABLED=true
MINIKUBE_DRIVER=docker # podman
MINIKUBE_RUNTIME=docker # cri-o
MINIKUBE_NODES=3
MINIKUBE_CPUS=8
MINIKUBE_MEMORY=12288
MINIKUBE_CLUSTERS=2
LINKERD_ENABLED=false
LINKERD_INJECT=false
LINKERD_ENTERPRISE=false
LINKERD_ENTERPRISE_OPERATOR=false # Work in progress
LINKERD_HTTP_ROUTE_ENABLED=false
STEP_ENABLED=false
LINKERD_VIZ_ENABLED=false
PROMETHEUS_ENABLED=false
GRAFANA_ENABLED=false
NGINX_ENABLED=false
APP_IMAGE_BUILD_ENABLED=true
APP_IMAGE_DEPLOY_ENABLED=true
APP_IMAGE_REGISTRY_LOGIN=false
APP_IMAGE_REGISTRY_SERVER=localhost:5000
APP_TRAFFIC_ENABLED=false

# ---------------------------------------------------------
# Functions
# ---------------------------------------------------------
function check_tools {
    if ! command -v kubectl &> /dev/null; then
        echo "Kubectl is not installed. Please install kubectl."
        exit 1
    fi
    if ! command -v helm &> /dev/null; then
        echo "Helm is not installed. Please install Helm."
        exit 1
    fi
    if [ $MINIKUBE_ENABLED == true ] && ! command -v minikube &> /dev/null; then
        echo "Minikube is not installed. Please install Minikube."
        exit 1
    fi
    if [ $STEP_ENABLED == true ] && ! command -v step &> /dev/null; then
        echo "Step is not installed. Please install Step."
        exit 1
    fi
    if [ $MINIKUBE_DRIVER == "podman" ] && ! command -v podman &> /dev/null; then
        echo "Podman is not installed. Please install Podman."
        exit 1
    fi
    if [ $MINIKUBE_DRIVER == "docker" ] && ! command -v docker &> /dev/null; then
        echo "Docker is not installed. Please install Docker."
        exit 1
    fi
    echo "All tools are installed."
}

function start_minikube {
    if [ $MINIKUBE_ENABLED == false ]; then
        echo "Minikube is not enabled. Skipping Minikube setup."
        return
    fi
    if minikube status | grep -q "Running"; then
        # echo "Minikube is already running. Starting a new instance will stop the existing one."
        # minikube delete
        echo "Minikube is already running. Skipping Minikube setup."
        return
    fi
    echo "Starting Minikube..."
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    echo "Starting Minikube with $MINIKUBE_CPUS CPUs and $MINIKUBE_MEMORY MB memory with multi-cluster support..."
    for i in $(seq 1 $MINIKUBE_CLUSTERS); do
        echo "Starting Minikube cluster $i..."
        minikube start --driver=$MINIKUBE_DRIVER \
            --container-runtime=$MINIKUBE_RUNTIME \
            --nodes=$MINIKUBE_NODES \
            --cpus=$MINIKUBE_CPUS \
            --memory=$MINIKUBE_MEMORY \
            --insecure-registry "$LOCAL_IP:5000" \
            --insecure-registry "10.0.0.0/24" \
            --profile "cluster-$i"
    done
    if [ $MINIKUBE_NODES > 1 ]; then
        minikube profile "cluster-1"
        echo "The first Minikube cluster will be used for the registry and shared with the other clusters."
        echo "Enabling Minikube registry addon..."
        minikube addons enable registry
        echo "Port-forwarding Minikube registry to localhost on port 5000..."
        kubectl port-forward --namespace kube-system service/registry 5000:80 &
        PORT_FORWARD_PID=$!  # Capture the PID of the kubectl port-forward command
        echo "You can now push images to the Minikube registry at localhost:5000."
        echo "The sub-process ID for the port-forwarding is $PORT_FORWARD_PID."
        update_docker_insicure_registries
    else 
        eval $(minikube docker-env)
    fi
}

function update_docker_insicure_registries {
    SNAP_DOCKER_FILE="/snap/etc/docker/daemon.json"
    DOCKER_FILE="/etc/docker/daemon.json"
    REGISTRY_IP=$(minikube ip):5000

    if [ $MINIKUBE_ENABLED == false ] || [ $MINIKUBE_NODES == 1 ]; then
        echo "Minikube is not enabled or has only one node. Skipping Docker configuration."
        return
    fi
    if [ ! -f "$SNAP_DOCKER_FILE" ] && [ ! -f "$DOCKER_FILE" ]; then
        echo "$DOCKER_FILE does not exist. Creating it with the insecure registry."
        sudo mkdir -p $(dirname "$DOCKER_FILE")
        echo -e "{\n  \"insecure-registries\": [\"$REGISTRY_IP\"]\n}" | sudo tee "$DOCKER_FILE"
        sudo systemctl restart docker
        echo "Docker configuration created and service restarted."
        return
    else 
        echo "Docker configuration file already exists. Manually add the $REGISTRY_IP to the insecure registries."
    fi
}

function add_topology_label_to_nodes {
    if [ $MINIKUBE_ENABLED == false ]; then
        echo "Minikube is not enabled. Skipping Taxonomy setup."
        return
    fi
    echo "Adding Taxonomy labels to Minikube nodes..."
    zone_counter=1
    nodes=$(kubectl get nodes --no-headers -o custom-columns=":metadata.name")
    for node in $nodes; do
        zone_label="koreacentral-$zone_counter"
        echo "Labeling node $node with topology.kubernetes.io/zone=$zone_label"
        kubectl label nodes "$node" topology.kubernetes.io/zone="$zone_label" --overwrite
        zone_counter=$((zone_counter + 1))
    done
}

function add_agentpool_label_to_nodes {
    if [ "$MINIKUBE_ENABLED" == false ]; then
        echo "Minikube is not enabled. Skipping Agentpool setup."
        return
    fi
    echo "Adding Agentpool labels to Minikube nodes..."
    agentpool_counter=1
    nodes=$(kubectl get nodes --no-headers -o custom-columns=":metadata.name")
    total_nodes=$(echo "$nodes" | wc -l)
    half_nodes=$((total_nodes / 2))
    for node in $nodes; do
        if [ $agentpool_counter -le $half_nodes ]; then
            agentpool_label="system"
        else
            agentpool_label="application"
        fi
        echo "Labeling node $node with agentpool=$agentpool_label"
        kubectl label nodes "$node" agentpool="$agentpool_label" --overwrite
        agentpool_counter=$((agentpool_counter + 1))
    done
}

function generate_certificates {
    if [ $STEP_ENABLED == false ]; then
        echo "Step is not enabled. Skipping Step setup."
        return
    fi
    rm -rf ./certificates
    mkdir -p ./certificates
    step certificate create root.linkerd.cluster.local ./certificates/ca.crt ./certificates/ca.key --profile root-ca --no-password --insecure
    step certificate create identity.linkerd.cluster.local ./certificates/issuer.crt ./certificates/issuer.key --profile intermediate-ca --not-after 8760h --no-password --insecure --ca ./certificates/ca.crt --ca-key ./certificates/ca.key
}

function install_linkerd {
    if [ $LINKERD_ENABLED == false ]; then
        echo "Linkerd is not enabled. Skipping Linkerd setup."
        return
    fi
    # linkerd check --pre
    if [ $LINKERD_ENTERPRISE == true ]; then
        echo "Installing Linkerd Enterprise..."
        if [ -z "$BUOYANT_LICENSE" ]; then
            echo "Linkerd Enterprise license not found. Please provide the license."
            exit 1
        fi
        curl --proto '=https' --tlsv1.2 -sSfL https://enterprise.buoyant.io/install | sh
        export PATH=$HOME/.linkerd2/bin:$PATH   
        helm repo add linkerd-buoyant https://helm.buoyant.cloud
        helm repo update
        if [ $LINKERD_ENTERPRISE_OPERATOR == false ]; then
            echo "Installing Linkerd Enterprise CRDs..."
            helm upgrade --install linkerd-enterprise-crds linkerd-buoyant/linkerd-enterprise-crds \
                --namespace linkerd \
                --create-namespace
            echo "Installing Linkerd Enterprise Control Plane..."
            helm upgrade --install linkerd-enterprise-control-plane linkerd-buoyant/linkerd-enterprise-control-plane \
                --set license=$BUOYANT_LICENSE \
                -f ./helm/linkerd-enterprise/values.yaml \
                --set-file linkerd-control-plane.identityTrustAnchorsPEM=./certificates/ca.crt \
                --set-file linkerd-control-plane.identity.issuer.tls.crtPEM=./certificates/issuer.crt \
                --set-file linkerd-control-plane.identity.issuer.tls.keyPEM=./certificates/issuer.key \
                --namespace linkerd \
                --create-namespace 
        else 
            echo "Installing Linkerd Enterprise lifecycle automation operator. It will take care of the control plane and crds installation."
            helm upgrade --install linkerd-buoyant linkerd-buoyant/linkerd-buoyant \
                --set buoyantCloudEnabled=false \
                --set license=$BUOYANT_LICENSE \
                --set controlPlaneValidator.externalSecret=true \
                --set-file controlPlaneValidator.crtPEM=./certificates/issuer.key \
                --set-file controlPlaneValidator.keyPEM=./certificates/issuer.crt \
                --set-file controlPlaneValidator.caBundle=./certificates/ca.crt \
                --namespace linkerd-buoyant \
                --create-namespace
            # TODO: Add the secrets to the control plane
        fi
    else
        echo "Installing Linkerd..."
        curl --proto '=https' --tlsv1.2 -sSfL https://run.linkerd.io/install | sh
        export PATH=$HOME/.linkerd2/bin:$PATH
        helm repo add linkerd https://helm.linkerd.io/edge
        helm repo update
        echo "Installing Linkerd CRDs and Control Plane..."
        helm upgrade --install linkerd-crds linkerd/linkerd-crds \
            --namespace linkerd \
            --create-namespace
        echo "Installing Linkerd Control Plane..."
        helm upgrade --install linkerd-control-plane linkerd/linkerd-control-plane \
            --set-file identityTrustAnchorsPEM=certificates/ca.crt \
            --set-file identity.issuer.tls.crtPEM=certificates/issuer.crt \
            --set-file identity.issuer.tls.keyPEM=certificates/issuer.key \
            --set runAsRoot=true \
            --namespace linkerd \
            --create-namespace 
    fi
    # linkerd check
}

function install_nginx {
    if [ $NGINX_ENABLED == false ]; then
        echo "Nginx is not enabled. Skipping Nginx setup."
        return
    fi
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
    helm repo update
    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx --values ./helm/nginx/values.yaml
}

function install_prometheus {
    if [ $PROMETHEUS_ENABLED == false ]; then
        echo "Prometheus is not enabled. Skipping Prometheus setup."
        return
    fi
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update
    echo "Installing Kube State Metrics..."
    helm upgrade -install kube-state-metrics prometheus-community/kube-state-metrics \
        -f ./helm/kube-state-metrics/values.yaml \
        --namespace monitoring \
        --create-namespace 
    echo "Installing Prometheus..."
    helm upgrade --install prometheus prometheus-community/prometheus \
        --values ./helm/prometheus/values.yaml \
        --namespace monitoring \
        --create-namespace  
     if [ $LINKERD_VIZ_ENABLED == false ]; then
        echo "Authorizaing Prometheus to scrape Linkerd..."
        kubectl apply -f ./manifests/authorization-policy-fedetation-prometheus.yaml
    fi
}

function install_grafana {
    if [ $GRAFANA_ENABLED == false ]; then
        echo "Linkerd Viz is not enabled. Skipping Linkerd Viz setup."
        return
    fi
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo update
    helm upgrade --install grafana grafana/grafana --values ./helm/grafana/values.yaml --create-namespace --namespace monitoring
}

function install_linkerd_viz {
    if [ $LINKERD_VIZ_ENABLED == false ]; then
        echo "Linkerd Viz is not enabled. Skipping Linkerd Viz setup."
        return
    fi
    helm repo add linkerd https://helm.linkerd.io/edge
    helm repo update
    helm upgrade --install linkerd-viz linkerd/linkerd-viz --values ./helm/linkerd-viz/values.yaml --create-namespace --namespace linkerd-viz
}

function build_application {
    if [ $APP_IMAGE_BUILD_ENABLED == false ]; then
        echo "Application image building is not enabled. Skipping image building."
        return
    fi
    docker build -t $APP_IMAGE_REGISTRY_SERVER/application ./application
    docker build -t $APP_IMAGE_REGISTRY_SERVER/projects ./apis/projects
    docker build -t $APP_IMAGE_REGISTRY_SERVER/tasks ./apis/tasks
    docker build -t $APP_IMAGE_REGISTRY_SERVER/comments ./apis/comments
    if [ $APP_IMAGE_REGISTRY_LOGIN == true ]; then
        docker login --username $APP_IMAGE_REGISTRY_USERNAME --password $APP_IMAGE_REGISTRY_PASSWORD $APP_IMAGE_REGISTRY_SERVER
    fi
    docker push $APP_IMAGE_REGISTRY_SERVER/application
    docker push $APP_IMAGE_REGISTRY_SERVER/projects
    docker push $APP_IMAGE_REGISTRY_SERVER/tasks
    docker push $APP_IMAGE_REGISTRY_SERVER/comments
}

function install_application {
    if [ $APP_IMAGE_DEPLOY_ENABLED == false ]; then
        echo "Application image installation is not enabled. Skipping application installation."
        return
    fi
    helm upgrade --install application --values ./application/helm/values.yaml ./helm/custom/ --create-namespace --namespace vastaya --set container.image.repository=$APP_IMAGE_REGISTRY_SERVER
    helm upgrade --install projects --values ./apis/projects/helm/values.yaml ./helm/custom/ --create-namespace --namespace vastaya --set container.image.repository=$APP_IMAGE_REGISTRY_SERVER
    helm upgrade --install tasks --values ./apis/tasks/helm/values.yaml ./helm/custom/ --create-namespace --namespace vastaya --set container.image.repository=$APP_IMAGE_REGISTRY_SERVER
    helm upgrade --install comments --values ./apis/comments/helm/values.yaml ./helm/custom/ --create-namespace --namespace vastaya --set container.image.repository=$APP_IMAGE_REGISTRY_SERVER
}

function inject_linkerd {
    if [ $LINKERD_INJECT == false ]; then
        echo "Linkerd injection is not enabled. Skipping Linkerd injection."
        return
    fi
    kubectl get deploy application-vastaya-dplmt -n vastaya -o yaml | linkerd inject - | kubectl apply -f -
    kubectl get deploy projects-vastaya-dplmt -n vastaya -o yaml | linkerd inject - | kubectl apply -f -
    kubectl get deploy tasks-vastaya-dplmt -n vastaya -o yaml | linkerd inject - | kubectl apply -f -
    kubectl get deploy comments-vastaya-dplmt -n vastaya -o yaml | linkerd inject - | kubectl apply -f -

    kubectl rollout restart deploy -n vastaya application-vastaya-dplmt
    kubectl rollout restart deploy -n vastaya projects-vastaya-dplmt
    kubectl rollout restart deploy -n vastaya tasks-vastaya-dplmt
    kubectl rollout restart deploy -n vastaya comments-vastaya-dplmt
}

function simulate_traffic {
    if [ $APP_TRAFFIC_ENABLED == false ]; then
        echo "Application traffic simulation is not enabled. Skipping traffic simulation."
        return
    fi
    if kubectl get job bot-get-project-report; then
        echo "Job already exists. Deleting the existing job..."
        kubectl delete job bot-get-project-report
    fi
    # kubectl apply -f ./bots/bot-get-projects.yaml
    kubectl apply -f ./bots/bot-get-project-report.yaml
    # kubectl apply -f ./bots/bot-get-comments.yaml
}

function simulate_http_route {
    if [ $LINKERD_HTTP_ROUTE_ENABLED == false ]; then
        echo "Linkerd HTTP route simulation is not enabled. Skipping HTTP route simulation."
        return
    fi
    echo "IMPORTANT: The ingress controller will need to have the Linkerd proxy injected, and the ingress instance will need the 'nginx.ingress.kubernetes.io/service-upstream: "true"' annotation."
    kubectl apply -f ./manifests/linkerd-http-route.yaml
    echo "HTTP route simulation is enabled. 80% of traffic to projects will go to the tasks service and 20% to the projects service."
}

# ---------------------------------------------------------
# Main Script
# ---------------------------------------------------------

check_tools
start_minikube
add_topology_label_to_nodes
add_agentpool_label_to_nodes
generate_certificates
install_linkerd # Not working normally. Work in progress
install_linkerd_viz
install_prometheus # Work in progress
install_grafana
install_nginx
build_application
install_application
inject_linkerd
simulate_traffic
