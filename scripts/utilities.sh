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

function isLinkerdEnterprise() {
    local VERSION=$1
    if ! command -v jq &> /dev/null; then
        exit 1
    fi
    local VERSIONS=$(curl -s "https://artifacthub.io/api/v1/packages/helm/linkerd-buoyant/linkerd-enterprise-control-plane" | jq -r '.available_versions[].version')
    if [ $? -ne 0 ] || [ -z "$VERSIONS" ]; then
        return 1
    fi
    if echo "$VERSIONS" | grep -q "^$VERSION$"; then
        return 0 
    else
        return 1 
    fi
}

function isLinkerdStable() {
    local VERSION=$1
    if ! command -v jq &> /dev/null; then
        exit 1
    fi
    local VERSIONS=$(curl -s "https://artifacthub.io/api/v1/packages/helm/linkerd2/linkerd-control-plane" | jq -r '.available_versions[].version')
    if [ $? -ne 0 ] || [ -z "$VERSIONS" ]; then
        return 1
    fi
    if echo "$VERSIONS" | grep -q "^$VERSION$"; then
        return 0
    else
        return 1
    fi
}