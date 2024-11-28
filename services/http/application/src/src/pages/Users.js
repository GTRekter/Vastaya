import React, { Component } from 'react';
import './users.css';
import UsersService from '../services/UsersService';

export default class Users extends Component {
    state = {
        users: [],
    };

    constructor(props) {
        super(props);
        this.onClickEditUser = this.onClickEditUser.bind(this);
        this.onClickDeleteUser = this.onClickDeleteUser.bind(this);
    }

    componentDidMount() {
        console.log("Fetching users from the API");
        console.log("API URL:", process.env.REACT_APP_USERS_API_URL);
        UsersService.getUsers()
            .then(users => this.setState({ users }))
            .catch(error => console.error('Error fetching projects:', error));
    }

    onClickEditUser(userId) {
        console.log("Edit user", userId);
    }

    onClickDeleteUser(userId) {
        console.log("Delete user", userId);
    }

    render() {
        return (
            <div className="full-height-container">
                <div className="text-center text-white py-5">
                    <h1>Users</h1>
                    <p>These are all the users listed in the database</p>
                    <div className="container">
                        <table className="table table-dark table-striped">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {this.state.users.map(user => 
                                    <tr key={user.id}>
                                        <td>{user.id}</td>
                                        <td>{user.name}</td>
                                        <td>{user.email}</td>
                                        <td>
                                            <button className="btn btn-primary" onClick={() => this.onClickEditUser(user.id)}>Edit</button>
                                            <button className="btn btn-danger" onClick={() => this.onClickDeleteUser(user.id)}>Delete</button>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }
}
