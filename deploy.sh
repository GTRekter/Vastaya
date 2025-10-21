docker image remove galaxies-api   
docker image remove planets-api   
docker image remove planet-worker 
docker image remove vastaya-frontend  
docker build -t vastaya-frontend:latest web
docker build -t galaxies-api:latest apis/galaxies/server
docker build -t planets-api:latest apis/planets/server
docker build -t planet-worker:latest apis/planets/worker

k3d image import -c vastaya \
    vastaya-frontend:latest \
    galaxies-api:latest \
    planets-api:latest \
    planet-worker:latest
    
helm uninstall -n vastaya vastaya
helm upgrade --install vastaya charts --namespace vastaya --create-namespace
