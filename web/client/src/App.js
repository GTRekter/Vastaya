import React, { Component } from 'react';
import { Route } from 'react-router';
import { Layout } from './components/Layout';
import Home from './pages/Home';

export default class App extends Component {
    render () {
        return (
            <Layout>
                <Route exact path='/' component={Home} />
            </Layout>
        );
    }
}
