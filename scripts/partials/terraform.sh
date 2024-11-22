function deploy_ncloud {
    terraform init ./terraform/ncloud
    terraform apply --auto-approve ./terraform/ncloud \
        --var "access_key=$NCLOUD_ACCESS_KEY" \
        --var "secret_key=$NCLOUD_SECRET_KEY" \
        --var "region=$NCLOUD_REGION"
}