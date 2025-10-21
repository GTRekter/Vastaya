class UsersService {    
    getUsers(){

        return fetch(process.env.REACT_APP_USERS_API_URL,{ 
            method: 'get',
            mode: 'cors',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin':'*'
            }
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`Failed to fetch users`);
            }
            return res.json();
        })
        .catch(err => {
            console.error(err);
            throw err;
        });
    }
}
export default new UsersService();