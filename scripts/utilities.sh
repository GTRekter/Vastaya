function log_message() {
    local STATUS=$1
    local MESSAGE=$2
    local NC='\033[0m'
    local RED='\033[0;31m'
    local GREEN='\033[0;32m'
    local YELLOW='\033[0;33m'
    local BLUE='\033[0;34m'
    local PURPLE='\033[0;35m'
    local DATE=$(date "+%H:%M:%S")
    case "$STATUS" in
        INFO)
            echo -e "${BLUE}${DATE} [INFO] ${MESSAGE}${NC}"
            ;;
        WARNING)
            echo -e "${YELLOW}${DATE} [WARN] ${MESSAGE}${NC}"
            ;;
        ERROR)
            echo -e "${RED}${DATE} [ERROR] ${MESSAGE}${NC}"
            ;;
        SUCCESS)
            echo -e "${GREEN}${DATE} [SUCCESS] ${MESSAGE}${NC}"
            ;;
        DEBUG)
            echo -e "${PURPLE}${DATE} [DEBUG] ${MESSAGE}${NC}"
            ;;
        *)
            echo -e "${NC}${DATE} [UNKNOWN] ${MESSAGE}${NC}"
            ;;
    esac
}
function uninstall_helm_release {
    RELEASE_NAME=$1
    NAMESPACES=$(kubectl get namespaces -o jsonpath='{.items[*].metadata.name}')
    for NAMESPACE in $NAMESPACES; do
        if helm list -n $NAMESPACE | grep -q $RELEASE_NAME; then
            helm uninstall $RELEASE_NAME -n $NAMESPACE
        fi
    done
}