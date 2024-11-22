#!/bin/bash
set -e  
set -u  

# ---------------------------------------------------------
# Load sensitive data from the settings.sh file and utilities
# ---------------------------------------------------------
source "$(dirname "$0")/settings.sh"
source "$(dirname "$0")/utilities.sh"
source "$(dirname "$0")/configurations.sh"
source "$(dirname "$0")/partials/minikube.sh"
source "$(dirname "$0")/partials/linkerd.sh"
source "$(dirname "$0")/partials/application.sh"
source "$(dirname "$0")/partials/nginx.sh"
source "$(dirname "$0")/partials/linkerd-viz.sh"
source "$(dirname "$0")/partials/linkerd-failover.sh"
source "$(dirname "$0")/partials/prometheus.sh"
source "$(dirname "$0")/partials/grafana.sh"
source "$(dirname "$0")/partials/cert-manager.sh"
source "$(dirname "$0")/partials/datadog.sh"
source "$(dirname "$0")/partials/argo.sh"
source "$(dirname "$0")/partials/k6.sh"
# source "$(dirname "$0")/partials/linkerd-extensions.sh"
# source "$(dirname "$0")/partials/linkerd-multicluster.sh"
# source "$(dirname "$0")/partials/monitoring.sh"
# source "$(dirname "$0")/partials/traffic-simulation.sh"
# source "$(dirname "$0")/partials/application.sh"
# ---------------------------------------------------------
# Script Description
# ---------------------------------------------------------
# This Bash script automates the setup and deployment of a Kubernetes cluster, Linkerd, NGINX, Prometheus, Grafana, 
# and a sample application. The script handles multiple aspects such as Minikube cluster setup, certificate generation,
# installation of Linkerd and its enterprise features, and application deployment. Additionally, it provides functionality 
# for checking dependencies, configuring traffic simulation, and controlling the injection of Linkerd into applications.
# ---------------------------------------------------------
# Main Script
# ---------------------------------------------------------
if [ "$MINIKUBE_CLEANUP" == true ]; then
    minikube.cleanup
fi
if [ "$MINIKUBE_ENABLED" == true ]; then
    log_message "INFO" "Starting Minikube cluster setup..."
    minikube.start -d $MINIKUBE_DRIVER -r $MINIKUBE_RUNTIME -n $MINIKUBE_NODES_COUNT -c $MINIKUBE_CLUSTERS_COUNT -p $MINIKUBE_CPUS -m $MINIKUBE_MEMORY
    if [ $? -ne 0 ]; then
        log_message "ERROR" "Failed to start Minikube cluster."
        exit 1
    fi
    log_message "SUCCESS" "Minikube cluster setup completed."
else 
    log_message "INFO" "Minikube cluster setup is disabled. Skipping..."
fi

if [ "$APP_CLEANUP" == true ]; then
    minikube.cleanup
fi
if [ "$APP_BUILD_ENABLED" == true ]; then
    log_message "INFO" "Building application images..."
    application.build -r $APP_REGISTRY_SERVER
    if [ $? -ne 0 ]; then
        log_message "ERROR" "Failed to build application images."
        exit 1
    fi
    log_message "SUCCESS" "Application images built successfully."
else 
    log_message "INFO" "Application image build is disabled. Skipping..."
fi
if [ "$APP_PUSH_ENABLED" == true ]; then
    log_message "INFO" "Pushing application images..."
    application.push -r $APP_REGISTRY_SERVER -u $APP_REGISTRY_USERNAME -p $APP_REGISTRY_PASSWORD
    if [ $? -ne 0 ]; then
        log_message "ERROR" "Failed to push application images."
        exit 1
    fi
    log_message "SUCCESS" "Application images pushed successfully."
else 
    log_message "INFO" "Application image push is disabled. Skipping..."
fi

# deploy_ncloud

for INDEX in $(seq 1 $MINIKUBE_CLUSTERS_COUNT); do
    if [ $INDEX -gt 1 ]; then
        echo "Switching to the first Minikube cluster to get the application registry server..."
        minikube profile "cluster-1"
        APP_IMAGE_REGISTRY_SERVER=$(minikube ip):5000
    fi
    minikube profile "cluster-$INDEX"
    if [ "$LINKERD_CLEANUP" == true ]; then
        linkerd.cleanup
    fi
    if [ "$LINKERD_ENABLED" == true ]; then
        log_message "INFO" "Installing Linkerd..."
        linkerd.install -o "$BUOYANT_OPERATOR" -l "$BUOYANT_LICENSE" -e "$BUOYANT_CLOUD_ENABLED" -i "$API_CLIENT_ID" -s "$API_CLIENT_SECRET" -a "$BUOYANT_AGENT_NAME" -c "$CERT_MANAGER_ENABLED" -v "$LINKERD_VERSION"
        if [ $? -ne 0 ]; then
            log_message "ERROR" "Failed to install Linkerd."
            exit 1
        fi
        log_message "SUCCESS" "Linkerd installation completed."
    else 
        log_message "INFO" "Linkerd installation is disabled. Skipping..."
    fi
    if [ "$APP_DEPLOY_ENABLED" == true ]; then
        log_message "INFO" "Deploying application..."
        application.install -r $APP_REGISTRY_SERVER
        if [ $? -ne 0 ]; then
            log_message "ERROR" "Failed to deploy application."
            exit 1
        fi
        log_message "SUCCESS" "Application deployment completed."
    else 
        log_message "INFO" "Application deployment is disabled. Skipping..."
    fi
    if [ "$NGINX_ENABLED" == true ]; then
        log_message "INFO" "Installing NGINX..."
        nginx.install
        if [ $? -ne 0 ]; then
            log_message "ERROR" "Failed to install NGINX."
            exit 1
        fi
        log_message "SUCCESS" "NGINX installation completed."
    else 
        log_message "INFO" "NGINX installation is disabled. Skipping..."
    fi
    if [ "$LINKERD_INJECT" == true ]; then
        log_message "INFO" "Injecting Linkerd into the application..."
        linkerd.inject -n "vastaya" -d "application-vastaya-dplmt"
        linkerd.inject -n "vastaya" -d "comments-vastaya-dplmt"
        linkerd.inject -n "vastaya" -d "projects-vastaya-dplmt"
        linkerd.inject -n "vastaya" -d "tasks-vastaya-dplmt"
        linkerd.inject_debug_container -n "vastaya" -d "projects-vastaya-dplmt"
        linkerd.inject -n "default" -d "ingress-nginx-controller"
        if [ $? -ne 0 ]; then
            log_message "ERROR" "Failed to inject Linkerd into the application."
            exit 1
        fi
        log_message "SUCCESS" "Linkerd injection completed."
    else 
        log_message "INFO" "Linkerd injection is disabled. Skipping..."
    fi
done

if [ "$LINKERD_VIZ_ENABLED" == true ]; then
    log_message "INFO" "Installing Linkerd Viz..."
    linkerd_viz.install -c "$CERT_MANAGER_ENABLED"
    if [ $? -ne 0 ]; then
        log_message "ERROR" "Failed to install Linkerd Viz."
        exit 1
    fi
    log_message "SUCCESS" "Linkerd Viz installation completed."
else 
    log_message "INFO" "Linkerd Viz installation is disabled. Skipping..."
fi

if [ "$LINKERD_HTTP_ROUTE_ENABLED" == true ]; then
    log_message "INFO" "Installing Linkerd HTTP route..."
    linkerd.deploy_http_route
    if [ $? -ne 0 ]; then
        log_message "ERROR" "Failed to install Linkerd HTTP route."
        exit 1
    fi
    log_message "SUCCESS" "Linkerd HTTP route installation completed."
else 
    log_message "INFO" "Linkerd HTTP route installation is disabled. Skipping..."
fi

if [ "$LINKERD_FAILOVER_ENABLED" == true ]; then
    log_message "INFO" "Installing Linkerd Failover..."
    linkerd-failover.install
    linkerd-smi.install
    if [ $? -ne 0 ]; then
        log_message "ERROR" "Failed to install Linkerd Failover."
        exit 1
    fi
    log_message "SUCCESS" "Linkerd Failover installation completed."
else 
    log_message "INFO" "Linkerd Failover installation is disabled. Skipping..."
fi

# TODO: Work in progress
if [ "$PROMETHEUS_ENABLED" == true ]; then
    log_message "INFO" "Installing Prometheus..."
    prometheus.install -f "$PROMETHEUS_LINKERD_VIZ_FEDERATION_ENABLED"
    if [ $? -ne 0 ]; then
        log_message "ERROR" "Failed to install Prometheus."
        exit 1
    fi
    log_message "SUCCESS" "Prometheus installation completed."
else 
    log_message "INFO" "Prometheus installation is disabled. Skipping..."
fi

if [ "$GRAFANA_ENABLED" == true ]; then
    log_message "INFO" "Installing Grafana..."
    grafana.install
    if [ $? -ne 0 ]; then
        log_message "ERROR" "Failed to install Grafana."
        exit 1
    fi
    log_message "SUCCESS" "Grafana installation completed."
else 
    log_message "INFO" "Grafana installation is disabled. Skipping..."
fi

if [ "$CERT_MANAGER_ENABLED" == true ]; then
    log_message "INFO" "Installing Cert Manager..."
    cert-manager.install
    if [ $? -ne 0 ]; then
        log_message "ERROR" "Failed to install Cert Manager."
        exit 1
    fi
    log_message "SUCCESS" "Cert Manager installation completed."
else 
    log_message "INFO" "Cert Manager installation is disabled. Skipping..."
fi

if [ "$DATADOG_ENABLED" == true ]; then
    log_message "INFO" "Installing Datadog..."
    datadog.install
    if [ $? -ne 0 ]; then
        log_message "ERROR" "Failed to install Datadog."
        exit 1
    fi
    log_message "SUCCESS" "Datadog installation completed."
else 
    log_message "INFO" "Datadog installation is disabled. Skipping..."
fi

if [ "$ARGO_ENABLED" == true ]; then
    log_message "INFO" "Installing Argo..."
    argo.install
    if [ $? -ne 0 ]; then
        log_message "ERROR" "Failed to install Argo."
        exit 1
    fi
    log_message "SUCCESS" "Argo installation completed."
else 
    log_message "INFO" "Argo installation is disabled. Skipping..."
fi

if [ "$K6_LOAD_TEST_ENABLED" == true ]; then
    log_message "INFO" "Simulating traffic..."
    k6.start
    if [ $? -ne 0 ]; then
        log_message "ERROR" "Failed to simulate traffic."
        exit 1
    fi
    log_message "SUCCESS" "Traffic simulation completed."
else 
    log_message "INFO" "Traffic simulation is disabled. Skipping..."
fi

# link_clusters
# install_metric_server
# install_argo
# install_datadog
# simulate_traffic
# # cleanup