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
# 7. MINIKUBE_CLUSTERS            : (optional) Number of Minikube clusters to create. Default is 2.
# 8. MINIKUBE_CLEANUP             : (optional) Flag to enable or disable Minikube cleanup. Default is false.
# 9. BUOYANT_LICENSE              : License key for Linkerd Enterprise installation.
# 10. LINKERD_ENABLED             : (optional) Flag to enable or disable Linkerd installation. Default is false.
# 11. LINKERD_INJECT              : (optional) Enables Linkerd proxy injection into application deployments. Default is false.
# 12. LINKERD_ENTERPRISE          : (optional) Flag to enable Linkerd Enterprise installation. Default is false.
# 13. LINKERD_ENTERPRISE_OPERATOR : (optional) Controls whether to install the Linkerd Enterprise operator (work in progress). Default is false.
# 14. LINKERD_HTTP_ROUTE_ENABLED  : (optional) Enables HTTP route simulation for Linkerd. Default is false.
# 15. LINKERD_CLOUD_ENABLED       : (optional) Enables Linkerd Cloud dashboard installation. Default is false.
# 16. STEP_ENABLED                : (optional) Enables certificate generation using `step` CLI. Default is false.
# 17. LINKERD_VIZ_ENABLED         : (optional) Enables Linkerd Viz dashboard installation. Default is false.
# 18. PROMETHEUS_ENABLED          : (optional) Flag to enable Prometheus installation. Default is false.
# 19. GRAFANA_ENABLED             : (optional) Enables Grafana installation for monitoring. Default is false.
# 20. NGINX_ENABLED               : (optional) Flag to enable NGINX Ingress controller installation. Default is false.
# 21. CERT_MANAGER_ENABLED        : (optional) Flag to enable Cert Manager installation. If linkerd is enable, it will configure Linkerd certificates to auto-rotate. Default is false.
# 22. DATADOG_ENABLED             : (optional) Flag to enable Datadog installation for monitoring. Default is false.
# 23. APP_IMAGE_BUILD_ENABLED     : (optional) Controls whether to build the Docker images for the application. Default is false.
# 24. APP_IMAGE_DEPLOY_ENABLED    : (optional) Enables the deployment of application images to the cluster. Default is false.
# 25. APP_IMAGE_REGISTRY_LOGIN    : (optional) Indicates whether to log into the Docker registry or Azure Container Registry for pushing images. Default is false.
# 26. APP_IMAGE_REGISTRY_SERVER   : (optional) Docker registry server to which the application images will be pushed. Default is empty. 
# 27. APP_IMAGE_REGISTRY_USERNAME : (optional) Username for the Docker registry. Required if APP_IMAGE_REGISTRY_LOGIN is true.
# 28. APP_IMAGE_REGISTRY_PASSWORD : (optional) Password for the Docker registry. Required if APP_IMAGE_REGISTRY_LOGIN is true.
# 29. APP_TRAFFIC_ENABLED         : (optional) Flag to enable traffic simulation for the application. Default is false.

# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

MINIKUBE_ENABLED=true
MINIKUBE_DRIVER=docker
MINIKUBE_RUNTIME=docker
MINIKUBE_NODES=3
MINIKUBE_CPUS=8
MINIKUBE_MEMORY=12288
MINIKUBE_CLUSTERS=1
MINIKUBE_CLEANUP=false
LINKERD_ENABLED=true
LINKERD_INJECT=true
LINKERD_ENTERPRISE=true
LINKERD_ENTERPRISE_OPERATOR=false
LINKERD_HTTP_ROUTE_ENABLED=false
LINKERD_CLOUD_ENABLED=false
STEP_ENABLED=false
LINKERD_VIZ_ENABLED=false
PROMETHEUS_ENABLED=true
GRAFANA_ENABLED=false
NGINX_ENABLED=false
CERT_MANAGER_ENABLED=false
DATADOG_ENABLED=false
APP_IMAGE_BUILD_ENABLED=false
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
        if [ $i -gt 1 ]; then
            echo "Collecting the IP address of the first Minikube cluster to share with the other clusters as an insecure registry..."
            minikube profile "cluster-1"
            MAIN_CLUSTER_IP=$(minikube ip)
            minikube start --driver=$MINIKUBE_DRIVER \
                --container-runtime=$MINIKUBE_RUNTIME \
                --nodes=$MINIKUBE_NODES \
                --cpus=$MINIKUBE_CPUS \
                --memory=$MINIKUBE_MEMORY \
                --insecure-registry "$LOCAL_IP:5000" \
                --insecure-registry "$MAIN_CLUSTER_IP:5000" \
                --insecure-registry "10.0.0.0/24" \
                --network bridge \
                --profile "cluster-$i"
        else 
            minikube start --driver=$MINIKUBE_DRIVER \
                --container-runtime=$MINIKUBE_RUNTIME \
                --nodes=$MINIKUBE_NODES \
                --cpus=$MINIKUBE_CPUS \
                --memory=$MINIKUBE_MEMORY \
                --insecure-registry "$LOCAL_IP:5000" \
                --insecure-registry "10.0.0.0/24" \
                --network bridge \
                --profile "cluster-$i"
        fi
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
        echo "The sub-process ID for the port-forwarding is 5000."
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
    echo "Adding Taxonomy labels to Minikube nodes"
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
    echo "Adding Taxonomy labels to Minikube nodes"
    zone_counter=1
    nodes=$(kubectl get nodes --no-headers -o custom-columns=":metadata.name")
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
    step certificate create tap.linkerd-viz.svc ./certificates/tap.crt ./certificates/tap.key --profile leaf --not-after 43800h --no-password --insecure --ca ./certificates/ca.crt --ca-key ./certificates/ca.key --san tap.linkerd-viz.svc
}

function install_linkerd {
    if [ $LINKERD_ENABLED == false ]; then
        echo "Linkerd is not enabled. Skipping Linkerd setup."
        uninstall_helm_release linkerd-control-plane
        uninstall_helm_release linkerd-crds
        uninstall_helm_release linkerd-enterprise-control-plane
        uninstall_helm_release linkerd-enterprise-crds
        uninstall_helm_release linkerd-buoyant
        kubectl delete secret linkerd-identity-issuer --namespace=linkerd --ignore-not-found
        CERT_CONTENT=$(cat ./certificates/ca.crt | sed 's/^/          /')
        awk -v cert="$CERT_CONTENT" -v license="$BUOYANT_LICENSE" '{gsub(/PLACEHOLDER_CERTIFICATE/, cert); gsub(/PLACEHOLDER_LICENSE/, license)}1' ./manifests/linkerd/linkerd-operator-control-plane.yaml | kubectl delete --ignore-not-found -f - 
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
            if [ $CERT_MANAGER_ENABLED == false ]; then 
                if [ $LINKERD_CLOUD_ENABLED == false ]; then
                    echo "Installing Linkerd Enterprise Control Plane with issuing certificates and without Linkerd Cloud..."
                    helm upgrade --install linkerd-enterprise-control-plane linkerd-buoyant/linkerd-enterprise-control-plane \
                        --values ./helm/linkerd-enterprise/values.yaml \
                        --set-file linkerd-control-plane.identityTrustAnchorsPEM=./certificates/ca.crt \
                        --set-file linkerd-control-plane.identity.issuer.tls.crtPEM=./certificates/issuer.crt \
                        --set-file linkerd-control-plane.identity.issuer.tls.keyPEM=./certificates/issuer.key \
                        --set buoyantCloudEnabled=false \
                        --set license=$BUOYANT_LICENSE \
                        --namespace linkerd \
                        --create-namespace 
                else 
                    echo "Installing Linkerd Enterprise Control Plane with issuing certificates and Linkerd Cloud..."
                    helm upgrade --install linkerd-enterprise-control-plane linkerd-buoyant/linkerd-enterprise-control-plane \
                        --values ./helm/linkerd-enterprise/values.yaml \
                        --set-file linkerd-control-plane.identityTrustAnchorsPEM=./certificates/ca.crt \
                        --set-file linkerd-control-plane.identity.issuer.tls.crtPEM=./certificates/issuer.crt \
                        --set-file linkerd-control-plane.identity.issuer.tls.keyPEM=./certificates/issuer.key \
                        --set buoyantCloudEnabled=true \
                        --set metadata.agentName=Minikube \
                        --set license=$BUOYANT_LICENSE \
                        --set api.clientID=$API_CLIENT_ID \
                        --set api.clientSecret=$API_CLIENT_SECRET \
                        --namespace linkerd \
                        --create-namespace 
                fi
            else 
                if [ $LINKERD_CLOUD_ENABLED == false ]; then
                    echo "Installing Linkerd Enterprise Control Plane without issuing certificates and without Linkerd Cloud..."
                    helm upgrade --install linkerd-enterprise-control-plane linkerd-buoyant/linkerd-enterprise-control-plane \
                        --values ./helm/linkerd-enterprise/values.yaml \
                        --set-file linkerd-control-plane.identityTrustAnchorsPEM=./certificates/ca.crt \
                        --set linkerd-control-plane.identity.issuer.scheme=kubernetes.io/tls \
                        --set buoyantCloudEnabled=false \
                        --set license=$BUOYANT_LICENSE \
                        --namespace linkerd \
                        --create-namespace 
                else 
                    echo "Installing Linkerd Enterprise Control Plane without issuing certificates and Linkerd Cloud..."
                    helm upgrade --install linkerd-enterprise-control-plane linkerd-buoyant/linkerd-enterprise-control-plane \
                        --values ./helm/linkerd-enterprise/values.yaml \
                        --set-file linkerd-control-plane.identityTrustAnchorsPEM=./certificates/ca.crt \
                        --set linkerd-control-plane.identity.issuer.scheme=kubernetes.io/tls \
                        --set buoyantCloudEnabled=true \
                        --set metadata.agentName=Minikube \
                        --set license=$BUOYANT_LICENSE \
                        --set api.clientID=$API_CLIENT_ID \
                        --set api.clientSecret=$API_CLIENT_SECRET \
                        --namespace linkerd \
                        --create-namespace 
                fi
            fi
        else 
            if [ $LINKERD_CLOUD_ENABLED == false ]; then
                echo "Installing Linkerd Enterprise lifecycle automation operator. It will take care of the control plane and crds installation."
                helm upgrade --install linkerd-buoyant linkerd-buoyant/linkerd-buoyant \
                    --set buoyantCloudEnabled=false \
                    --set license=$BUOYANT_LICENSE \
                    --namespace linkerd-buoyant \
                    --create-namespace
            else
                echo "Installing Linkerd Enterprise lifecycle automation operator. It will take care of the control plane and crds installation."
                helm upgrade --install linkerd-buoyant linkerd-buoyant/linkerd-buoyant \
                    --set buoyantCloudEnabled=true \
                    --set metadata.agentName=Minikube \
                    --set api.clientID=$API_CLIENT_ID \
                    --set api.clientSecret=$API_CLIENT_SECRET \
                    --set license=$BUOYANT_LICENSE \
                    --namespace linkerd-buoyant \
                    --create-namespace
            fi
            kubectl delete secret linkerd-identity-issuer --namespace=linkerd --ignore-not-found
            kubectl create secret generic linkerd-identity-issuer \
                --namespace=linkerd \
                --from-file=ca.crt=./certificates/ca.crt \
                --from-file=tls.crt=./certificates/issuer.crt \
                --from-file=tls.key=./certificates/issuer.key
            CERT_CONTENT=$(cat ./certificates/ca.crt | sed 's/^/          /')
            awk -v cert="$CERT_CONTENT" -v license="$BUOYANT_LICENSE" '{gsub(/PLACEHOLDER_CERTIFICATE/, cert); gsub(/PLACEHOLDER_LICENSE/, license)}1' ./manifests/linkerd/linkerd-operator-control-plane.yaml | kubectl delete --ignore-not-found -f - 
            sleep 5 # TODO: Find a better way to wait for the deletion of the control plane
            awk -v cert="$CERT_CONTENT" -v license="$BUOYANT_LICENSE" '{gsub(/PLACEHOLDER_CERTIFICATE/, cert); gsub(/PLACEHOLDER_LICENSE/, license)}1' ./manifests/linkerd/linkerd-operator-control-plane.yaml | kubectl apply -f -
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
        if [ $CERT_MANAGER_ENABLED == false ]; then 
            echo "Installing Linkerd Edge Control Plane with issuing certificates..."
            helm upgrade --install linkerd-control-plane linkerd/linkerd-control-plane \
                --set-file identityTrustAnchorsPEM=certificates/ca.crt \
                --set-file identity.issuer.tls.crtPEM=certificates/issuer.crt \
                --set-file identity.issuer.tls.keyPEM=certificates/issuer.key \
                --set runAsRoot=true \
                --namespace linkerd \
                --create-namespace 
        else
            echo "Installing Linkerd Edge Control Plane without issuing certificates..."
            helm upgrade --install linkerd-control-plane linkerd/linkerd-control-plane \
                --set-file identityTrustAnchorsPEM=certificates/ca.crt \
                --set identity.issuer.scheme=kubernetes.io/tls \
                --set runAsRoot=true \
                --namespace linkerd \
                --create-namespace 
        fi  
    fi
    # linkerd check
}

function install_nginx {
    if [ $NGINX_ENABLED == false ]; then
        echo "Nginx is not enabled. Skipping Nginx setup."
        uninstall_helm_release ingress-nginx
        return
    fi
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
    helm repo update
    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
        --values ./helm/nginx/values.yaml
}

function install_prometheus {
    if [ $PROMETHEUS_ENABLED == false ]; then
        echo "Prometheus is not enabled. Skipping Prometheus setup."
        uninstall_helm_release kube-state-metrics
        uninstall_helm_release prometheus
        return
    fi
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update
    echo "Installing Kube State Metrics..."
    helm upgrade -install kube-state-metrics prometheus-community/kube-state-metrics \
        --values ./helm/kube-state-metrics/values.yaml \
        --namespace monitoring \
        --create-namespace 
    echo "Installing Prometheus..."
    if [ $LINKERD_VIZ_ENABLED == false ]; then
        helm upgrade --install prometheus prometheus-community/prometheus \
            --values ./helm/prometheus/values.yaml \
            --namespace monitoring \
            --create-namespace  
    else
        helm upgrade --install prometheus prometheus-community/prometheus \
            --values ./helm/prometheus/values-federation-viz.yaml \
            --namespace monitoring \
            --create-namespace   
        echo "Authorizaing Prometheus to scrape Linkerd..."
        kubectl apply -f ./manifests/linkerd/prometheus-federate.yaml
    fi
}

function install_grafana {
    if [ $GRAFANA_ENABLED == false ]; then
        echo "Grafana is not enabled. Skipping Grafana setup."
        uninstall_helm_release grafana
        return
    fi
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo update
    helm upgrade --install grafana grafana/grafana \
        --values ./helm/grafana/values.yaml \
        --create-namespace \
        --namespace monitoring
}

function install_linkerd_viz {
    if [ $LINKERD_VIZ_ENABLED == false ]; then
        echo "Linkerd Viz is not enabled. Skipping Linkerd Viz setup."
        uninstall_helm_release linkerd-viz
        return
    fi
    helm repo add linkerd https://helm.linkerd.io/edge
    helm repo update
    helm upgrade --install linkerd-viz linkerd/linkerd-viz \
        --values ./helm/linkerd-viz/values.yaml \
        --set tap.enabled=true \
        --set tap.externalSecret=true \
        --set-file tap.crtPEM=./certificates/tap.key \
        --set-file tap.keyPEM=./certificates/tap.crt \
        --set-file tap.caBundle=./certificates/ca.crt \
        --create-namespace \
        --namespace linkerd-viz

    kubectl delete secret generic tap-k8s-tls --namespace=linkerd-viz --ignore-not-found
    kubectl create secret tls tap-k8s-tls \
        --namespace=linkerd-viz \
        --cert=./certificates/tap.crt \
        --key=./certificates/tap.key

    kubectl rollout restart deploy -n linkerd-viz tap

}

function install_cert_manager {
    if [ $CERT_MANAGER_ENABLED == false ]; then
        echo "Cert Manager is not enabled. Skipping Cert Manager setup."
        uninstall_helm_release cert-manager
        return
    fi
    echo "Installing Cert Manager..."
    helm repo add cert-manager https://charts.jetstack.io
    helm repo update
    helm upgrade --install cert-manager cert-manager/cert-manager \
        --values ./helm/cert-manager/values.yaml \
        --create-namespace \
        --namespace cert-manager
    if [ $LINKERD_ENABLED == true ]; then
        echo "Configuring Cert Manager for Linkerd..."

        kubectl delete secret linkerd-trust-anchor --namespace=linkerd --ignore-not-found
        kubectl create secret tls linkerd-trust-anchor \
            --cert=./certificates/ca.crt \
            --key=./certificates/ca.key \
            --namespace=linkerd
        
        kubectl delete -f ./manifests/linkerd/cert-manager-issuer.yaml --ignore-not-found
        kubectl delete -f ./manifests/linkerd/cert-manager-issuer-cert.yaml --ignore-not-found

        kubectl apply -f ./manifests/linkerd/cert-manager-issuer.yaml
        kubectl apply -f ./manifests/linkerd/cert-manager-issuer-cert.yaml
    fi
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
        uninstall_helm_release application
        uninstall_helm_release projects
        uninstall_helm_release tasks
        uninstall_helm_release comments
        return
    fi
    echo "Installing the application Helm chart on cluster-$i..."
    helm upgrade --install application \
        --values ./application/helm/values.yaml \
        --set container.image.repository=$APP_IMAGE_REGISTRY_SERVER \
        --create-namespace \
        --namespace vastaya \
        ./helm/custom/
    helm upgrade --install projects \
        --values ./apis/projects/helm/values.yaml \
        --set container.image.repository=$APP_IMAGE_REGISTRY_SERVER \
        --create-namespace \
        --namespace vastaya \
        ./helm/custom/
    helm upgrade --install tasks \
        --values ./apis/tasks/helm/values.yaml \
        --set container.image.repository=$APP_IMAGE_REGISTRY_SERVER \
        --create-namespace \
        --namespace vastaya \
        ./helm/custom/
    helm upgrade --install comments \
        --values ./apis/comments/helm/values.yaml \
        --set container.image.repository=$APP_IMAGE_REGISTRY_SERVER \
        --create-namespace \
        --namespace vastaya \
        ./helm/custom/
}

function install_datadog {
    if [ $DATADOG_ENABLED == false ]; then
        echo "Datadog is not enabled. Skipping Datadog setup."
        uninstall_helm_release datadog
        return
    fi
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

function inject_linkerd {
    if [ $LINKERD_INJECT == false ]; then
        echo "Linkerd injection is not enabled. Skipping Linkerd injection."
        return
    fi
    for i in $(seq 1 $MINIKUBE_CLUSTERS); do
        minikube profile "cluster-$i"
        echo "Injecting Linkerd into the application deployments on cluster-$i..."

        echo "Waiting for Linkerd to be ready..."
        kubectl wait --for=condition=available \
            --timeout=300s deploy \
            --namespace=linkerd \
            linkerd-destination
        kubectl wait --for=condition=available \
            --timeout=300s deploy \
            --namespace=linkerd \
            linkerd-proxy-injector
        kubectl wait --for=condition=available \
            --timeout=300s deploy \
            --namespace=linkerd \
            linkerd-identity

        echo "Waiting for application deployments to be ready..."
        kubectl wait deploy --for=condition=available \
            --timeout=300s \
            --namespace=vastaya \
            application-vastaya-dplmt 
        kubectl wait deploy --for=condition=available \
            --timeout=300s \
            --namespace=vastaya \
            projects-vastaya-dplmt 
        kubectl wait deploy --for=condition=available \
            --timeout=300s \
            --namespace=vastaya \
            tasks-vastaya-dplmt 
        kubectl wait deploy --for=condition=available \
            --timeout=300s \
            --namespace=vastaya \
            comments-vastaya-dplmt 

        echo "Injecting Linkerd into the application deployments..."
        kubectl get deploy application-vastaya-dplmt -n vastaya -o yaml | linkerd inject - | kubectl apply -f -
        kubectl get deploy projects-vastaya-dplmt -n vastaya -o yaml | linkerd inject - | kubectl apply -f -
        kubectl get deploy tasks-vastaya-dplmt -n vastaya -o yaml | linkerd inject - | kubectl apply -f -
        kubectl get deploy comments-vastaya-dplmt -n vastaya -o yaml | linkerd inject - | kubectl apply -f -

        echo "Restarting the application deployments..."
        kubectl rollout restart deploy -n vastaya application-vastaya-dplmt
        kubectl rollout restart deploy -n vastaya projects-vastaya-dplmt
        kubectl rollout restart deploy -n vastaya tasks-vastaya-dplmt
        kubectl rollout restart deploy -n vastaya comments-vastaya-dplmt
    done
}

function simulate_traffic {
    if [ $APP_TRAFFIC_ENABLED == false ]; then
        echo "Application traffic simulation is not enabled. Skipping traffic simulation."
        return
    fi
    kubectl delete -f ./manifests/bots/bot-get-project-report.yaml --ignore-not-found
    kubectl apply -f ./manifests/bots/bot-get-project-report.yaml

    kubectl delete -f ./manifests/bots/bot-get-projects.yaml --ignore-not-found
    kubectl apply -f ./manifests/bots/bot-get-projects.yaml

    kubectl delete -f ./manifests/bots/bot-get-comments.yaml --ignore-not-found
    kubectl apply -f ./manifests/bots/bot-get-comments.yaml
}

function simulate_http_route {
    if [ $LINKERD_HTTP_ROUTE_ENABLED == false ]; then
        echo "Linkerd HTTP route simulation is not enabled. Skipping HTTP route simulation."
        return
    fi
    echo "IMPORTANT: The ingress controller will need to have the Linkerd proxy injected, and the ingress instance will need the 'nginx.ingress.kubernetes.io/service-upstream: "true"' annotation."
    kubectl apply -f ./manifests/linkerd/httproute-gateway.yaml
    echo "HTTP route simulation is enabled. 80% of traffic to projects will go to the tasks service and 20% to the projects service."
}

function uninstall_helm_release {
    RELEASE_NAME=$1
    NAMESPACES=$(kubectl get namespaces -o jsonpath='{.items[*].metadata.name}')
    for NAMESPACE in $NAMESPACES; do
        if helm list -n $NAMESPACE | grep -q $RELEASE_NAME; then
            echo "Uninstalling Helm release: $RELEASE_NAME from namespace: $NAMESPACE"
            helm uninstall $RELEASE_NAME -n $NAMESPACE
        fi
    done
}

function cleanup {
    if [ $MINIKUBE_CLEANUP == true ]; then
        echo "Cleaning up Minikube..."
        for i in $(seq 1 $MINIKUBE_CLUSTERS); do
            minikube profile "cluster-$i"
            minikube delete
        done
    fi
}

# ---------------------------------------------------------
# Main Script
# ---------------------------------------------------------

check_tools
start_minikube
generate_certificates
build_application
for i in $(seq 1 $MINIKUBE_CLUSTERS); do
    if [ $i -gt 1 ]; then
        echo "Switching to the first Minikube cluster to get the application registry server..."
        minikube profile "cluster-1"
        APP_IMAGE_REGISTRY_SERVER=$(minikube ip):5000
    fi
    minikube profile "cluster-$i"
    add_topology_label_to_nodes
    add_agentpool_label_to_nodes
    install_linkerd
    install_cert_manager 
    install_linkerd_viz
    install_nginx
    install_application
    inject_linkerd
done
install_datadog
install_prometheus # Work in progress
install_grafana

simulate_traffic
# cleanup