function application.cleanup {
    uninstall_helm_release application
    uninstall_helm_release projects
    uninstall_helm_release tasks
    uninstall_helm_release comments
}
function application.build {
    OPTIND=1
    local REGISTRY_SERVER="localhost:5000"
    local APP_PROTOCOL="http"
    while getopts "r:p:" opt; do
        case $opt in
            r) REGISTRY_SERVER="$OPTARG" ;;
            p) APP_PROTOCOL="$OPTARG" ;;
            *) echo "Invalid option: -$OPTARG" >&2; return 1 ;;
        esac
    done
    # TODO: Implement the build process for the application and comments services
    if [ "$APP_PROTOCOL" == "grpc" ]; then
        docker build --quiet -t $REGISTRY_SERVER/projects ./services/$APP_PROTOCOL/projects
        docker build --quiet -t $REGISTRY_SERVER/tasks ./services/$APP_PROTOCOL/tasks
        docker build --quiet -t $REGISTRY_SERVER/comments ./services/$APP_PROTOCOL/comments
    fi
    if [ "$APP_PROTOCOL" == "http" ]; then
        docker build --quiet -t $REGISTRY_SERVER/application ./services/$APP_PROTOCOL/application
        docker build --quiet -t $REGISTRY_SERVER/projects ./services/$APP_PROTOCOL/projects
        docker build --quiet -t $REGISTRY_SERVER/tasks ./services/$APP_PROTOCOL/tasks
        docker build --quiet -t $REGISTRY_SERVER/comments ./services/$APP_PROTOCOL/comments
    fi
}
function application.push {
    OPTIND=1
    local REGISTRY_SERVER="localhost:5000"
    local REGISTRY_LOGIN="false"
    local REGISTRY_USERNAME=""
    local REGISTRY_PASSWORD=""
    while getopts "r:u:p:l" opt; do
        case $opt in
            r) REGISTRY_SERVER="$OPTARG" ;;
            u) REGISTRY_USERNAME="$OPTARG" ;;
            p) REGISTRY_PASSWORD="$OPTARG" ;;
            l) APP_IMAGE_REGISTRY_LOGIN="true" ;;
            *) echo "Invalid option: -$OPTARG" >&2; return 1 ;;
        esac
    done
    if [ -n "$REGISTRY_SERVER" ] && [ -n "$REGISTRY_USERNAME" ] && [ -n "$REGISTRY_PASSWORD" ]; then
        docker login --username "$REGISTRY_USERNAME" --password "$REGISTRY_PASSWORD" "$REGISTRY_SERVER"
    fi
    docker push --quiet $REGISTRY_SERVER/application
    docker push --quiet $REGISTRY_SERVER/projects
    docker push --quiet $REGISTRY_SERVER/tasks
    docker push --quiet $REGISTRY_SERVER/comments
}
function application.install {
    OPTIND=1
    local REGISTRY_SERVER="localhost:5000"
    local APP_PROTOCOL="http"
    while getopts "r:p:" opt; do
        case $opt in
            r) REGISTRY_SERVER="$OPTARG" ;;
            p) APP_PROTOCOL="$OPTARG" ;;
            *) echo "Invalid option: -$OPTARG" >&2; return 1 ;;
        esac
    done
    # helm upgrade --install application \
    #     --values ./services/$APP_PROTOCOL/application/helm/values.yaml \
    #     --set container.image.repository=$REGISTRY_SERVER \
    #     --create-namespace \
    #     --namespace vastaya \
    #     ./kubernetes/helm/custom/
    helm upgrade --install projects \
        --values ./services/$APP_PROTOCOL/projects/helm/values.yaml \
        --set container.image.repository=$REGISTRY_SERVER \
        --create-namespace \
        --namespace vastaya \
        ./kubernetes/helm/custom/
    helm upgrade --install tasks \
        --values ./services/$APP_PROTOCOL/tasks/helm/values.yaml \
        --set container.image.repository=$REGISTRY_SERVER \
        --create-namespace \
        --namespace vastaya \
        ./kubernetes/helm/custom/
    helm upgrade --install comments \
        --values ./services/$APP_PROTOCOL/comments/helm/values.yaml \
        --set container.image.repository=$REGISTRY_SERVER \
        --create-namespace \
        --namespace vastaya \
        ./kubernetes/helm/custom/
}