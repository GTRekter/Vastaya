import React, { useCallback, useEffect, useState } from 'react';
import FleetCommand from '../components/FleetCommand';
import ActiveMissions from '../components/ActiveMissions';
import { fetchMissions, createMission, terminateMission } from '../services/fleetApi';
import { getWarpSpeedMeta } from '../data/fleet';

const formatMissionForUi = (mission) => {
    const warpMeta = getWarpSpeedMeta(mission.speed);
    return {
        ...mission,
        fleetSize: mission.rps,
        warpLabel: warpMeta?.label || mission.speed,
        startedAt: new Date(mission.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
};

const FleetCommandPage = () => {
    const [activeMissions, setActiveMissions] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const loadMissions = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await fetchMissions();
            const hydrated = (data?.missions || [])
                .filter((mission) => mission.status !== 'terminated')
                .map((mission) => formatMissionForUi(mission));
            setActiveMissions(hydrated);
        } catch (err) {
            console.error(err);
            setError(err.message || 'Failed to load missions.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadMissions();
    }, [loadMissions]);

    const handleMissionLaunch = async (missionDetails) => {
        setError(null);
        try {
            const payload = {
                source: missionDetails.source,
                destination: missionDetails.destination,
                rps: missionDetails.fleetSize,
                speed: missionDetails.warpSpeed,
                escortEnabled: missionDetails.escortEnabled,
            };
            const created = await createMission(payload);
            setActiveMissions((prev) => [formatMissionForUi(created), ...prev]);
        } catch (err) {
            console.error(err);
            setError(err.message || 'Failed to launch mission.');
        }
    };

    const handleTerminateMission = async (missionId) => {
        setError(null);
        try {
            await terminateMission(missionId);
            setActiveMissions((prev) => prev.filter((mission) => mission.id !== missionId));
        } catch (err) {
            console.error(err);
            setError(err.message || 'Failed to terminate mission.');
        }
    };

    return (
        <div className="container full-height-container">
            <div className="text-white text-center py-5">
                <p className="eyebrow">Traffic & Load</p>
                <h1>Fleet Command Center</h1>
                <p>Control RPS, burstiness, and routing decisions for your convoy of requests. Perfect for showing how Linkerd keeps the galaxy secure, observable, and resilient under duress.</p>
            </div>
            <div className="mb-3">
                {error && <div className="alert alert-danger">{error}</div>}
                <FleetCommand onMissionLaunch={handleMissionLaunch} />
            </div>
            {isLoading && <p className="text-white-50 text-center">Loading active missions...</p>}
            <ActiveMissions missions={activeMissions} onTerminate={handleTerminateMission} />
        </div>
    );
};

export default FleetCommandPage;
