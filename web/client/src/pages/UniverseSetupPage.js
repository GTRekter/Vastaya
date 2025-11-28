import React from 'react';
import UniverseBuilder from '../components/UniverseBuilder';

const UniverseSetupPage = () => {
    return (
        <div className="container full-height-container">
            <div className="text-white text-center py-5">
                <p className="eyebrow">Core Scenario</p>
                <h1>Galactic Shipping Lane Simulator</h1>
                <p>You are the Admiral of the Interstellar Shipping Bureau. Every slider generates a Kubernetes object, every dropdown maps to a Linkerd policy. Craft your universe, then unleash the traffic.</p>
            </div>
            <UniverseBuilder />
        </div>
    );
};

export default UniverseSetupPage;