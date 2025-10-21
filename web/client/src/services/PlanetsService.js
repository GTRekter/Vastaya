class PlanetsService {    
    getPlanets(){
        return fetch(process.env.REACT_APP_PLANETS_API_URL,{
            method: 'GET',
            mode: 'cors',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            }
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`Failed to fetch planets`);
            }
            return res.json();
        })
        .catch(err => {
            console.error(err);
            throw err;
        });
    }
    getPlanetsByGalaxyId(galaxyId) {
        return fetch(`${process.env.REACT_APP_PLANETS_API_URL}/galaxies/${galaxyId}`,{
            method: 'GET',
            mode: 'cors',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            }
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`Failed to fetch planets for galaxy ${galaxyId}`);
            }
            return res.json();
        })
        .catch(err => {
            console.error(err);
            throw err;
        });
    }
    createPlanet(galaxyId, payload){
        return fetch(`${process.env.REACT_APP_PLANETS_API_URL}/galaxies/${galaxyId}`,{
            method: 'POST',
            mode: 'cors',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })
        .then(async res => {
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                const message =
                    (data && typeof data.message === 'string' && data.message.trim()) ||
                    `Failed to create planet in galaxy ${galaxyId}`;
                throw new Error(message);
            }
            return data;
        })
        .catch(err => {
            console.error(err);
            throw err;
        });
    }
    updatePlanetStatus(galaxyId, planetId, payload){
        return fetch(`${process.env.REACT_APP_PLANETS_API_URL}/galaxies/${galaxyId}/${planetId}/status`,{
            method: 'PUT',
            mode: 'cors',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`Failed to update planet ${planetId}`);
            }
            return res.json();
        })
        .catch(err => {
            console.error(err);
            throw err;
        });
    }
    getWorkerBaseUrl(galaxyId, planet) {
        if (!planet || !planet.serviceName) {
            throw new Error('Planet worker service is not available.');
        }

        const namespace = (galaxyId || '').trim();
        if (!namespace) {
            throw new Error('Galaxy identifier is required to reach the planet worker.');
        }

        const serviceHost = `${planet.serviceName}.${namespace}.svc.cluster.local`;
        const httpPort = planet.httpPort ? Number(planet.httpPort) : 8080;
        return `http://${serviceHost}:${httpPort}`;
    }
    getPlanetTrafficStatus(galaxyId, planet) {
        const baseUrl = this.getWorkerBaseUrl(galaxyId, planet);
        return fetch(`${baseUrl}/status`, {
            method: 'GET',
            mode: 'cors',
            headers: {
                'Accept': 'application/json, text/plain, */*',
            },
        })
            .then(async res => {
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                    const message =
                        (data && typeof data.message === 'string' && data.message.trim()) ||
                        'Failed to fetch traffic status.';
                    throw new Error(message);
                }
                return data;
            })
            .catch(err => {
                console.error(err);
                throw err;
            });
    }
    startPlanetTraffic(galaxyId, planet, config) {
        const baseUrl = this.getWorkerBaseUrl(galaxyId, planet);
        return fetch(`${baseUrl}/send`, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(config),
        })
            .then(async res => {
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                    const message =
                        (data && typeof data.message === 'string' && data.message.trim()) ||
                        'Failed to start traffic.';
                    throw new Error(message);
                }
                return data;
            })
            .catch(err => {
                console.error(err);
                throw err;
            });
    }
    stopPlanetTraffic(galaxyId, planet) {
        const baseUrl = this.getWorkerBaseUrl(galaxyId, planet);
        return fetch(`${baseUrl}/stop`, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Accept': 'application/json, text/plain, */*',
            },
        })
            .then(async res => {
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                    const message =
                        (data && typeof data.message === 'string' && data.message.trim()) ||
                        'Failed to stop traffic.';
                    throw new Error(message);
                }
                return data;
            })
            .catch(err => {
                console.error(err);
                throw err;
            });
    }
}
export default new PlanetsService();
