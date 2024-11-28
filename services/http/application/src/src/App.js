import React, { Component } from 'react';
import { Route } from 'react-router';
import { Layout } from './components/Layout';
import Home from './pages/Home';
import Users from './pages/Users';
import Projects from './pages/Projects';
import ProjectDetails from './pages/ProjectDetails';

export default class App extends Component {
    render () {
        return (
            <Layout>
                <Route exact path='/' component={Home} />
                <Route path='/users'component={Users} />
                <Route exact path='/projects' component={Projects} />
                <Route exact path='/projects/:projectId' component={ProjectDetails} />
            </Layout>
        );
    }
}


