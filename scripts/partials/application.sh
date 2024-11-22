function application.cleanup {
    uninstall_helm_release application
    uninstall_helm_release projects
    uninstall_helm_release tasks
    uninstall_helm_release comments
}
function application.build {
    OPTIND=1
    local REGISTRY_SERVER="localhost:5000"
    while getopts "r:" opt; do
        case $opt in
            r) REGISTRY_SERVER="$OPTARG" ;;
            *) echo "Invalid option: -$OPTARG" >&2; return 1 ;;
        esac
    done
    docker build --quiet -t $REGISTRY_SERVER/application ./application
    docker build --quiet -t $REGISTRY_SERVER/projects ./apis/projects
    docker build --quiet -t $REGISTRY_SERVER/tasks ./apis/tasks
    docker build --quiet -t $REGISTRY_SERVER/comments ./apis/comments
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
    while getopts "r:" opt; do
        case $opt in
            r) REGISTRY_SERVER="$OPTARG" ;;
            *) echo "Invalid option: -$OPTARG" >&2; return 1 ;;
        esac
    done
    helm upgrade --install application \
        --values ./application/helm/values.yaml \
        --set container.image.repository=$REGISTRY_SERVER \
        --create-namespace \
        --namespace vastaya \
        ./helm/custom/
    helm upgrade --install projects \
        --values ./apis/projects/helm/values.yaml \
        --set container.image.repository=$REGISTRY_SERVER \
        --create-namespace \
        --namespace vastaya \
        ./helm/custom/
    helm upgrade --install tasks \
        --values ./apis/tasks/helm/values.yaml \
        --set container.image.repository=$REGISTRY_SERVER \
        --create-namespace \
        --namespace vastaya \
        ./helm/custom/
    helm upgrade --install comments \
        --values ./apis/comments/helm/values.yaml \
        --set container.image.repository=$REGISTRY_SERVER \
        --create-namespace \
        --namespace vastaya \
        ./helm/custom/
}