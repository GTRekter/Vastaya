import React from 'react';
import UniverseMap from '../components/UniverseMap';

const VisualUniversePage = () => (
    <div className="container-fluid full-height-container py-4">
        <div className="text-white text-center mb-4">
            <p className="eyebrow">Live View</p>
            <h1>Visual Universe</h1>
            <p className="text-muted">Real-time map of planets and active fleet missions. Click a planet or mission to inspect it.</p>
        </div>
        <UniverseMap />
    </div>
);

export default VisualUniversePage;
