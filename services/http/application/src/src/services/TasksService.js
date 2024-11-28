class TasksService {    
    getTasks(){
        return fetch(process.env.REACT_APP_TASKS_API_URL,{ 
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
                throw new Error(`Failed to fetch tasks`);
            }
            return res.json();
        })
        .catch(err => {
            console.error(err);
            throw err;
        });
    }
    getTasksByProjectId(projectId) {
        return fetch(`${process.env.REACT_APP_TASKS_API_URL}/projects/${projectId}`,{
            method: 'GET',
            mode: 'cors',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            }
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`Failed to fetch tasks for project ${projectId}`);
            }
            return res.json();
        })
        .catch(err => {
            console.error(err);
            throw err;
        });
    }
    updateTaskStatus(taskId, task){
        return fetch(`${process.env.REACT_APP_TASKS_API_URL}/${taskId}/status`,{
            method: 'PUT',
            mode: 'cors',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(task)
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`Failed to update task ${taskId}`);
            }
            return res.json();
        })
        .catch(err => {
            console.error(err);
            throw err;
        });
    }
}
export default new TasksService();