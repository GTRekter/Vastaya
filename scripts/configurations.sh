# ---------------------------------------------------------
# Configuration
# 1. MINIKUBE_ENABLED              : (optional|false) Flag to enable or disable Minikube setup. If enabled it will start a Minikube cluster, add topology labels to nodes, and update Docker insecure registries if the number of nodes is highter than 1.
# 2. MINIKUBE_DRIVER               : (docker) Specifies the Minikube driver to use (e.g., Docker, Podman).
# 3. MINIKUBE_RUNTIME              : (docker) Defines the container runtime for Minikube (e.g., Docker, CRI-O).
# 4. MINIKUBE_NODES                : (optional) Number of nodes to create in the Minikube cluster. Default is 3.
# 5. MINIKUBE_CPUS                 : (optional) Number of CPUs to allocate to the Minikube cluster. Default is 8.
# 6. MINIKUBE_MEMORY               : (optional) Memory in MB to allocate to the Minikube cluster. Default is 12288.
# 7. MINIKUBE_CLUSTERS             : (optional) Number of Minikube clusters to create. Default is 2.
# 8. MINIKUBE_CLEANUP              : (optional) Flag to enable or disable Minikube cleanup. Default is false.
# 9. NCLOUD_ENABLED                : (optional) Flag to enable or disable NCloud infrastructure setup. Default is false.
# 10. BUOYANT_LICENSE              : License key for Linkerd Enterprise installation.
# 11. LINKERD_ENABLED              : (optional) Flag to enable or disable Linkerd installation. Default is false.
# 12. LINKERD_INJECT               : (optional) Enables Linkerd proxy injection into application deployments. Default is false.
# 13. LINKERD_ENTERPRISE           : (optional) Flag to enable Linkerd Enterprise installation. Default is false.
# 14. LINKERD_ENTERPRISE_OPERATOR  : (optional) Controls whether to install the Linkerd Enterprise operator (work in progress). Default is false.
# 15. LINKERD_MULTICLUSTER_ENABLED : (optional) Enables Linkerd multi-cluster installation. Default is false.
# 16. LINKERD_HTTP_ROUTE_ENABLED   : (optional) Enables HTTP route simulation for Linkerd. Default is false.
# 17. LINKERD_CLOUD_ENABLED        : (optional) Enables Linkerd Cloud dashboard installation. Default is false.
# 18. LINKERD_VIZ_ENABLED          : (optional) Enables Linkerd Viz dashboard installation. Default is false.
# 19. STEP_ENABLED                 : (optional) Enables certificate generation using `step` CLI. Default is false.
# 20. PROMETHEUS_ENABLED           : (optional) Flag to enable Prometheus installation. Default is false.
# 21. GRAFANA_ENABLED              : (optional) Enables Grafana installation for monitoring. Default is false.
# 22. NGINX_ENABLED                : (optional) Flag to enable NGINX Ingress controller installation. Default is false.
# 23. CERT_MANAGER_ENABLED         : (optional) Flag to enable Cert Manager installation. If linkerd is enable, it will configure Linkerd certificates to auto-rotate. Default is false.
# 24. DATADOG_ENABLED              : (optional) Flag to enable Datadog installation for monitoring. Default is false.
# 25. ARGO_ENABLED                 : (optional) Flag to enable ArgoCD installation. Default is false.
# 26. APP_IMAGE_BUILD_ENABLED      : (optional) Controls whether to build the Docker images for the application. Default is false.
# 27. APP_IMAGE_PUSH_ENABLED       : (optional) Controls whether to push the Docker images to the registry. Default is false.
# 28. APP_IMAGE_DEPLOY_ENABLED     : (optional) Enables the deployment of application images to the cluster. Default is false.
# 29. APP_IMAGE_REGISTRY_LOGIN     : (optional) Indicates whether to log into the Docker registry or Azure Container Registry for pushing images. Default is false.
# 30. APP_IMAGE_REGISTRY_SERVER    : (optional) Docker registry server to which the application images will be pushed. Default is empty. 
# 31. APP_IMAGE_REGISTRY_USERNAME  : (optional) Username for the Docker registry. Required if APP_IMAGE_REGISTRY_LOGIN is true.
# 32. APP_IMAGE_REGISTRY_PASSWORD  : (optional) Password for the Docker registry. Required if APP_IMAGE_REGISTRY_LOGIN is true.
# 33. APP_TRAFFIC_ENABLED          : (optional) Flag to enable traffic simulation for the application. Default is false.
# 
# ---------------------------------------------------------
MINIKUBE_ENABLED=true
MINIKUBE_DRIVER=docker
MINIKUBE_RUNTIME=docker
MINIKUBE_NODES=2
MINIKUBE_CPUS=8
MINIKUBE_MEMORY=12288
MINIKUBE_CLUSTERS=1
MINIKUBE_CLEANUP=false
NCLOUD_ENABLED=false
LINKERD_ENABLED=true
LINKERD_INJECT=true
LINKERD_ENTERPRISE=true
LINKERD_ENTERPRISE_OPERATOR=true 
LINKERD_CLOUD_ENABLED=true # To use Buoyant Cloud it is required to use the Operator (the Buoyant Cloud Agent manifest is present only in the Operator)
LINKERD_VIZ_ENABLED=true
# LINKERD_VERSION=2.15.2 #2.16.1
# 1.16.10 is 2.14.9
# LINKERD_VERSION=2.15.6
# LINKERD_VERSION=2.15.5
LINKERD_VERSION=2.16.1
LINKERD_MULTICLUSTER_ENABLED=false
LINKERD_HTTP_ROUTE_ENABLED=false
STEP_ENABLED=true
PROMETHEUS_ENABLED=false
GRAFANA_ENABLED=false
NGINX_ENABLED=false
CERT_MANAGER_ENABLED=false
DATADOG_ENABLED=false
ARGO_ENABLED=false
APP_IMAGE_BUILD_ENABLED=true
APP_IMAGE_PUSH_ENABLED=true
APP_IMAGE_DEPLOY_ENABLED=true
APP_IMAGE_REGISTRY_LOGIN=false
APP_IMAGE_REGISTRY_SERVER=localhost:5000
APP_TRAFFIC_ENABLED=false
