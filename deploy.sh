docker image remove galaxies-api   
docker image remove vastaya-frontend  
docker build -t vastaya-frontend:latest web
docker build -t galaxies-api:latest apis/galaxies

k3d image import -c vastaya \
    vastaya-frontend:latest \
    galaxies-api:latest
    
helm uninstall -n vastaya vastaya-frontend
helm upgrade --install vastaya-frontend charts/frontend \
    --namespace vastaya --create-namespace

helm uninstall -n vastaya galaxies-api
helm upgrade --install galaxies-api charts/galaxies \
    --namespace vastaya