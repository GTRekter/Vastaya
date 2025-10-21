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
    updatePlanetStatus(planetId, payload){
        return fetch(`${process.env.REACT_APP_PLANETS_API_URL}/${planetId}/status`,{
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
}
export default new PlanetsService();
