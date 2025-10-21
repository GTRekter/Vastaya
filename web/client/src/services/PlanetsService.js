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
    getPlanetTrafficStatus(galaxyId, planetId) {
        const encodedGalaxy = encodeURIComponent(galaxyId);
        const encodedPlanet = encodeURIComponent(planetId);
        return fetch(`${process.env.REACT_APP_PLANETS_API_URL}/galaxies/${encodedGalaxy}/${encodedPlanet}/traffic/status`, {
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
    startPlanetTraffic(galaxyId, planetId, config) {
        const encodedGalaxy = encodeURIComponent(galaxyId);
        const encodedPlanet = encodeURIComponent(planetId);
        return fetch(`${process.env.REACT_APP_PLANETS_API_URL}/galaxies/${encodedGalaxy}/${encodedPlanet}/traffic/start`, {
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
    stopPlanetTraffic(galaxyId, planetId) {
        const encodedGalaxy = encodeURIComponent(galaxyId);
        const encodedPlanet = encodeURIComponent(planetId);
        return fetch(`${process.env.REACT_APP_PLANETS_API_URL}/galaxies/${encodedGalaxy}/${encodedPlanet}/traffic/stop`, {
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
    deletePlanet(galaxyId, planetId) {
        const encodedGalaxy = encodeURIComponent(galaxyId);
        const encodedPlanet = encodeURIComponent(planetId);
        return fetch(`${process.env.REACT_APP_PLANETS_API_URL}/galaxies/${encodedGalaxy}/${encodedPlanet}`, {
            method: 'DELETE',
            mode: 'cors',
            headers: {
                'Accept': 'application/json, text/plain, */*',
            },
        })
            .then(async res => {
                if (res.status === 204) {
                    return true;
                }
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                    const message =
                        (data && typeof data.message === 'string' && data.message.trim()) ||
                        `Failed to delete planet ${planetId}`;
                    throw new Error(message);
                }
                return true;
            })
            .catch(err => {
                console.error(err);
                throw err;
            });
    }
}
export default new PlanetsService();
