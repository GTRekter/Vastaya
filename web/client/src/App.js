import React, { Component } from 'react';
import { Route } from 'react-router';
import { Layout } from './components/Layout';
import HomePage from './pages/HomePage';
import ChatPage from './pages/ChatPage';
import UniverseSetupPage from './pages/UniverseSetupPage';
import FleetCommandPage from './pages/FleetCommandPage';
import VisualUniversePage from './pages/VisualUniversePage';

export default class App extends Component {
    render () {
        return (
            <Layout>
                <Route exact path='/' component={HomePage} />
                <Route exact path='/gpt' component={ChatPage} />
                <Route exact path='/universe' component={UniverseSetupPage} />
                <Route exact path='/fleet' component={FleetCommandPage} />
                <Route exact path='/visual-universe' component={VisualUniversePage} />
            </Layout>
        );
    }
}
