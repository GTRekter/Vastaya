class GalaxiesService {    
    getGalaxies(){
        return fetch(process.env.REACT_APP_GALAXIES_API_URL,{ 
            method: 'GET',
            mode: 'cors',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            }
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`Failed to fetch galaxies`);
            }
            return res.json();
        })
        .catch(err => {
            console.error(err);
            throw err;
        });
    }
    getGalaxyById(galaxyId){
        return fetch(`${process.env.REACT_APP_GALAXIES_API_URL}/${galaxyId}`,{
            method: 'GET',
            mode: 'cors',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            }
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`Failed to fetch galaxy ${galaxyId}`);
            }
            return res.json();
        })
        .catch(err => {
            console.error(err);
            throw err;
        });
    }
    createGalaxy(payload){
        return fetch(process.env.REACT_APP_GALAXIES_API_URL,{
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
                    'Failed to create galaxy';
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
export default new GalaxiesService();
