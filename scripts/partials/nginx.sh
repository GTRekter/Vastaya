function nginx.install {
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
    helm repo update
    helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
        --values ./helm/nginx/values.yaml
}