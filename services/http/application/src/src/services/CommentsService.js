class CommentsService {    
    getCommentsByTaskId(taskId){
        return fetch(`${process.env.REACT_APP_COMMENTS_API_URL}/tasks/${taskId}`,{
            method: 'GET',
            mode: 'cors',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            }
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`Failed to fetch task ${taskId}`);
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