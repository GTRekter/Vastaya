import React, { Component } from 'react';
import octocatImage from '../images/octocat.png';
import './home.css';

export default class Home extends Component {
    render() {
        return (
            <div className="full-height-container">
                <div className="bg-white text-center py-5 octocat-container">
                    <img src={octocatImage} className="img-fluid" id="octocat-logo" alt="Octocat Logo" />
                </div>
                <div className="text-center text-white py-5">
                    <h1>Welcome to the Kubernetes Microservices Demo</h1>
                    <p className="lead">
                        This demo application showcases a microservices architecture with a React.js frontend and Node.js APIs, managed via the Yarn package manager. 
                        Currently, it features two APIs: Users and Projects, with more to come. 
                        All data is stored in memory, providing a simple yet effective demonstration of Kubernetes orchestration. 
                        Explore how Kubernetes facilitates deployment, scaling, and management of containerized applications in a real-world scenario.
                    </p>
                </div>
            </div>
        )
    }
}