class CommentsService {    
    getCommentsByPlanetId(planetId){
        return fetch(`${process.env.REACT_APP_COMMENTS_API_URL}/planets/${planetId}`,{
            method: 'GET',
            mode: 'cors',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            }
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`Failed to fetch planet ${planetId}`);
            }
            return res.json();
        })
        .catch(err => {
            console.error(err);
            throw err;
        });
    }
}
export default new CommentsService();
