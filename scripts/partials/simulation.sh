function simulate_traffic {
    kubectl delete -f ./manifests/bots/bot-get-project-report.yaml --ignore-not-found
    kubectl apply -f ./manifests/bots/bot-get-project-report.yaml
    kubectl delete -f ./manifests/bots/bot-get-projects.yaml --ignore-not-found
    kubectl apply -f ./manifests/bots/bot-get-projects.yaml
    kubectl delete -f ./manifests/bots/bot-get-comments.yaml --ignore-not-found
    kubectl apply -f ./manifests/bots/bot-get-comments.yaml
}