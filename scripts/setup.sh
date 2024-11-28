#!/bin/bash
set -e  
set -u  
# ---------------------------------------------------------
# Script Description
# ---------------------------------------------------------
# This Bash script automates the setup and deployment of a Kubernetes cluster, Linkerd, NGINX, Prometheus, Grafana, 
# and a sample application. The script handles multiple aspects such as Minikube cluster setup, certificate generation,
# installation of Linkerd and its enterprise features, and application deployment. Additionally, it provides functionality 
# for checking dependencies, configuring traffic simulation, and controlling the injection of Linkerd into applications.
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
source "$(dirname "$0")/partials/linkerd-multicluster.sh"
# ---------------------------------------------------------
# Minikube cluster setup
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
# ---------------------------------------------------------
# Application image setup
# ---------------------------------------------------------
if [ "$APP_CLEANUP" == true ]; then
    minikube.cleanup
fi
if [ "$APP_BUILD_ENABLED" == true ]; then
    log_message "INFO" "Building application images..."
    application.build -r $APP_REGISTRY_SERVER -p $APP_PROTOCOL
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
# ---------------------------------------------------------
# Cert Manager setup
# ---------------------------------------------------------
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
# ---------------------------------------------------------
# Grafana setup
# ---------------------------------------------------------
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
# ---------------------------------------------------------
# Datadog setup
# ---------------------------------------------------------
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
# ---------------------------------------------------------
# Argo setup
# ---------------------------------------------------------
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

for INDEX in $(seq 1 $MINIKUBE_CLUSTERS_COUNT); do
    if [ $INDEX -gt 1 ]; then
        echo "Switching to the first Minikube cluster to get the application registry server..."
        minikube profile "cluster-1"
        APP_IMAGE_REGISTRY_SERVER=$(minikube ip):5000
    fi
    minikube profile "cluster-$INDEX"
    # ---------------------------------------------------------
    # Linkerd setup
    # ---------------------------------------------------------
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
    # ---------------------------------------------------------
    # Application deployment
    # ---------------------------------------------------------
    if [ "$APP_DEPLOY_ENABLED" == true ]; then
        log_message "INFO" "Deploying application..."
        application.install -r $APP_REGISTRY_SERVER -p $APP_PROTOCOL
        if [ $? -ne 0 ]; then
            log_message "ERROR" "Failed to deploy application."
            exit 1
        fi
        log_message "SUCCESS" "Application deployment completed."
    else 
        log_message "INFO" "Application deployment is disabled. Skipping..."
    fi
    # ---------------------------------------------------------
    # NGINX setup
    # ---------------------------------------------------------
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
    # ---------------------------------------------------------
    # Linkerd injection
    # ---------------------------------------------------------
    if [ "$LINKERD_INJECT" == true ]; then
        log_message "INFO" "Injecting Linkerd into the application and NGINX..."
        if [ "$APP_DEPLOY_ENABLED" == true ]; then
            # linkerd.inject -n "vastaya" -d "application-vastaya-dplmt"
            # if [ $? -ne 0 ]; then
            #     log_message "ERROR" "Failed to inject Linkerd into the application."
            #     exit 1
            # fi
            linkerd.inject -n "vastaya" -d "comments-vastaya-dplmt"
            if [ $? -ne 0 ]; then
                log_message "ERROR" "Failed to inject Linkerd into the application."
                exit 1
            fi
            linkerd.inject -n "vastaya" -d "projects-vastaya-dplmt"
            if [ $? -ne 0 ]; then
                log_message "ERROR" "Failed to inject Linkerd into the application."
                exit 1
            fi
            linkerd.inject -n "vastaya" -d "tasks-vastaya-dplmt"
            if [ $? -ne 0 ]; then
                log_message "ERROR" "Failed to inject Linkerd into the application."
                exit 1
            fi
            linkerd.inject_debug_container -n "vastaya" -d "projects-vastaya-dplmt"
            if [ $? -ne 0 ]; then
                log_message "ERROR" "Failed to inject Linkerd into the application."
                exit 1
            fi
        fi
        if [ "$NGINX_ENABLED" == true ]; then
            linkerd.inject -n "default" -d "ingress-nginx-controller"
            if [ $? -ne 0 ]; then
                log_message "ERROR" "Failed to inject Linkerd into NGINX."
                exit 1
            fi
        fi
        log_message "SUCCESS" "Linkerd injection completed."
    else 
        log_message "INFO" "Linkerd injection is disabled. Skipping..."
    fi
    # ---------------------------------------------------------
    # Linkerd Multicluster setup
    # ---------------------------------------------------------
    if [ "$LINKERD_MULTICLUSTER_ENABLED" == true ] && [ "$MINIKUBE_NODES_COUNT" -gt 1 ]; then
        log_message "INFO" "Installing Linkerd Multicluster..."
        linkerd-multicluster.install
        if [ $? -ne 0 ]; then
            log_message "ERROR" "Failed to install Linkerd Multicluster."
            exit 1
        fi
        log_message "SUCCESS" "Linkerd Multicluster installation completed."

        if [ "$LINKERD_MULTICLUSTER_LINK_ENABLED" == true ]; then
            if [ $INDEX -gt 1 ]; then
                # ---------------------------------------------------------
                # Linkerd Multicluster linking
                # ---------------------------------------------------------
                log_message "INFO" "Linking clusters..."
                linkerd-multicluster.link -l "cluster-$INDEX" -r "cluster-1" -t "$LINKERD_MULTICLUSTER_GATEWAY_TYPE" -a "$LINKERD_MULTICLUSTER_GATEWAY_ADDRESSES" -p "$LINKERD_MULTICLUSTER_GATEWAY_PORT"
                if [ $? -ne 0 ]; then
                    log_message "ERROR" "Failed to link clusters."
                    exit 1
                fi
                log_message "SUCCESS" "Clusters linked successfully."
            fi
        fi
    else 
        log_message "INFO" "Linkerd Multicluster installation is disabled. Skipping..."
    fi
done
# ---------------------------------------------------------
# Linkerd Viz setup
# ---------------------------------------------------------
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
# ---------------------------------------------------------
# Linkerd HTTP route setup
# ---------------------------------------------------------
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
# ---------------------------------------------------------
# Prometheus setup
# TODO: Work in progress
# ---------------------------------------------------------
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
# ---------------------------------------------------------
# Simulate traffic
# ---------------------------------------------------------
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
# ---------------------------------------------------------
# Linkerd Failover setup
# ---------------------------------------------------------
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