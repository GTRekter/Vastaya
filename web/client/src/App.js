import React, { Component } from 'react';
import { Route } from 'react-router';
import { Layout } from './components/Layout';
import Home from './pages/Home';
import Galaxies from './pages/Galaxies';
import GalaxyDetails from './pages/GalaxyDetails';

export default class App extends Component {
    render () {
        return (
            <Layout>
                <Route exact path='/' component={Home} />
                <Route exact path='/galaxies' component={Galaxies} />
                <Route exact path='/galaxies/:galaxyId' component={GalaxyDetails} />
                {/* <Route exact path='/planets' component={Planets} /> */}
            </Layout>
        );
    }
}
