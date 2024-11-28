import React, { Component } from 'react';
import './projectDetails.css';
import TasksService from '../services/TasksService';
import ProjectsService from '../services/ProjectsService';
import CommentsService from '../services/CommentsService';

export default class ProjectDetails extends Component {
    state = {
        name: '',
        description: '',
        status: '',
        tasks: [],
        comments: []
    };

    constructor(props) {
        super(props);
        this.onClickOpenTask = this.onClickOpenTask.bind(this);
        this.onClickCompleteTask = this.onClickCompleteTask.bind(this);
        this.onCLickLoadComments = this.onCLickLoadComments.bind(this);
    }

    componentDidMount() {
        const { projectId } = this.props.match.params;
        console.log("Fetching project details for project ID:", projectId);
        ProjectsService.getProjectById(projectId)
            .then(project => this.setState({ name: project.name, description: project.description, status: project.status }))
            .catch(error => console.error('Error fetching project:', error));
        console.log("Fetching tasks for project ID:", projectId);
        console.log("API URL:", process.env.REACT_APP_TASKS_API_URL);
        TasksService.getTasksByProjectId(projectId)
            .then(tasks => this.setState({ tasks }))
            .catch(error => console.error('Error fetching tasks:', error));
    }

    onClickEditTask(taskId) {
        console.log("Edit task", taskId);
    }

    onClickDeleteTask(taskId) {
        console.log("Delete task", taskId);
    }

    onClickOpenTask(taskId) {
        TasksService.updateTaskStatus(taskId, { status: "open" })
            .then(() => {
                const tasks = this.state.tasks.map(task => {
                    if (task.id === taskId) {
                        task.status = "open";
                    }
                    return task;
                });
                this.setState({ tasks });
                const { projectId } = this.props.match.params;
                ProjectsService.getProjectById(projectId)
                    .then(project => this.setState({ status: project.status }))
                    .catch(error => console.error('Error fetching project:', error));
            })
            .catch(error => console.error('Error completing task:', error));
    }

    onClickCompleteTask(taskId) {
        TasksService.updateTaskStatus(taskId, { status: "completed" })
            .then(() => {
                const tasks = this.state.tasks.map(task => {
                    if (task.id === taskId) {
                        task.status = "completed";
                    }
                    return task;
                });
                this.setState({ tasks });
                const { projectId } = this.props.match.params;
                ProjectsService.getProjectById(projectId)
                    .then(project => this.setState({ status: project.status }))
                    .catch(error => console.error('Error fetching project:', error));
            })
            .catch(error => console.error('Error completing task:', error));
    }

    onCLickLoadComments(taskId) {
        if (!this.state.comments || this.state.comments.length === 0) {
            CommentsService.getCommentsByTaskId(taskId)
                .then(comments => this.setState({ comments: comments }))
                .catch(error => console.error('Error fetching comments:', error));
        } else {
            this.setState({ comments: [] });
        }
    }

    render() {
        return (
            <div className="full-height-container">
                <div className="text-center text-white py-5">   
                    <h1>{this.state.name}</h1>
                    <p>{this.state.description}</p>
                    <p>Status: {this.state.status}</p>
                </div>
                <div className="text-center text-white py-5">  
                    <h2>Tasks</h2>
                    <p>These are all the tasks listed in the database</p>
                    <div className="container">
                        <table className="table table-dark table-striped">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Description</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody className="accordion accordion-flush" id="accordionComments">
                                {this.state.tasks.map((task) => (
                                    <React.Fragment key={task.id}>
                                    <tr id={`accordionComments${task.id}`} className="accordion-item" onClick={() => this.onCLickLoadComments(task.id)}>
                                        <td data-bs-toggle="collapse" data-bs-target={`#collapse-${task.id}`} aria-expanded="false" aria-controls={`collapse-${task.id}`}>{task.id}</td>
                                        <td data-bs-toggle="collapse" data-bs-target={`#collapse-${task.id}`} aria-expanded="false" aria-controls={`collapse-${task.id}`}>{task.name}</td>
                                        <td data-bs-toggle="collapse" data-bs-target={`#collapse-${task.id}`} aria-expanded="false" aria-controls={`collapse-${task.id}`}>{task.description}</td>
                                        <td data-bs-toggle="collapse" data-bs-target={`#collapse-${task.id}`} aria-expanded="false" aria-controls={`collapse-${task.id}`}>{task.status}</td>
                                        <td>
                                            <button className="btn btn-primary" onClick={() => this.onClickCompleteTask(task.id)}>Complete</button>
                                            <button className="btn btn-danger" onClick={() => this.onClickOpenTask(task.id)}>Open</button>
                                        </td>
                                    </tr>
                                    <tr id={`collapse-${task.id}`} className="accordion-collapse collapse" aria-labelledby={`accordionComments${task.id}`} data-bs-parent="#accordionComments">
                                        <td colSpan="5">
                                            {this.state.comments ? (
                                                this.state.comments.map((comment) => (
                                                <div key={comment.id}>
                                                    <p><strong>{comment.author}</strong>: {comment.content}</p>
                                                </div>
                                                ))
                                            ) : (
                                                <p>Loading comments...</p>
                                            )}
                                        </td>
                                    </tr>
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }
}
