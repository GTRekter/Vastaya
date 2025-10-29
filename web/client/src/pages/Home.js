import React, { Component } from 'react';
import linkyImage from '../images/linky.png';
import Chat from '../components/Chat';
import './home.css';

export default class Home extends Component {
    render() {
        return (
            <div className="full-height-container home-wrapper">
                <div className="bg-white text-center py-5 octocat-container">
                    <img src={linkyImage} className="img-fluid" id="linkerd-logo" alt="Linky Logo" />
                </div>
                {/* <div className="text-center text-white py-5 hero-copy">
                    <h1>Welcome to the Kubernetes Microservices Demo</h1>
                    <p className="lead">
                        This demo app highlights Linkerd MCP features using a React frontend and a Node.js MCP client, managed with Yarn.
                    </p>
                </div> */}
                <div className="container-fluid py-5">
                    <div className="row justify-content-center">
                        <div className="col-md-9">
                            <Chat />
                        </div>
                    </div>
                </div>
                
            </div>
        );
    }
}
