import React, { useMemo, useState } from 'react';
import { PLANET_ROSTER } from '../data/planets';
import { WARP_SPEED_OPTIONS, getWarpSpeedMeta } from '../data/fleet';

const findAlternatePlanetId = (excludeId) => {
    const alternative = PLANET_ROSTER.find((planet) => planet.id !== excludeId);
    return alternative ? alternative.id : excludeId;
};

const FleetCommand = ({ onMissionLaunch }) => {
    const [fleetSize, setFleetSize] = useState(120);
    const [warpSpeed, setWarpSpeed] = useState('cruise');
    const [sourcePlanet, setSourcePlanet] = useState(PLANET_ROSTER[0]?.id ?? '');
    const [destinationPlanet, setDestinationPlanet] = useState(PLANET_ROSTER[1]?.id ?? PLANET_ROSTER[0]?.id ?? '');
    const [escortEnabled, setEscortEnabled] = useState(true);

    const selectedSourcePlanet = useMemo(() => PLANET_ROSTER.find((planet) => planet.id === sourcePlanet), [sourcePlanet]);

    const selectedDestinationPlanet = useMemo(
        () => PLANET_ROSTER.find((planet) => planet.id === destinationPlanet),
        [destinationPlanet]
    );

    const warpCopy = useMemo(() => getWarpSpeedMeta(warpSpeed)?.description, [warpSpeed]);

    const handleDeployFleet = () => {
        if (!selectedSourcePlanet || !selectedDestinationPlanet) {
            return;
        }
        const warpMeta = getWarpSpeedMeta(warpSpeed);
        if (onMissionLaunch) {
            onMissionLaunch({
                source: selectedSourcePlanet,
                destination: selectedDestinationPlanet,
                fleetSize,
                warpSpeed,
                warpLabel: warpMeta?.label || warpSpeed,
                escortEnabled,
            });
        }
    };

    return (
        <div className="panel-card text-white">
            <div className="row align-items-lg-center justify-content-between">
                <div className="col-lg">
                    <p className="eyebrow text-uppercase">
                        🚀 Launch the Fleet
                    </p>
                    <h2>
                        Fleet Command
                    </h2>
                    <p className="text-muted">
                        Configure the load generator job that keeps your Linkerd dashboards lively and your demos dramatic.
                    </p>
                </div>
                <div className="col-lg-auto">
                    <button className="btn btn-primary" type="button" onClick={handleDeployFleet}>
                        Launch the fleet 🚀
                    </button>
                </div>
            </div>

            <div className="row">
                <div className="col-4">
                    <div className="control-group mt-4">
                        <p className="text-uppercase text-muted small mb-2">Planetary traffic</p>
                        <p className="mb-0 text-muted">
                            Translates to requests per seconds with the current RPS of {fleetSize}.
                        </p>
                         <div className="mt-3">
                            <label className="form-label">Number of ships per second: <strong>{fleetSize}</strong></label>
                            <input 
                                className="form-range"
                                type="range"
                                min="1"
                                max="1000"
                                value={fleetSize}
                                onChange={(e) => setFleetSize(Number(e.target.value))} />
                        </div>
                    </div>
                </div>

                <div className="col-4">
                    <div className="control-group mt-4">
                        <p className="text-uppercase text-muted small mb-2">Ship speed</p>
                        <p className="mb-0 text-muted">
                           Choose how traffic flows between planets. All modes keep the same average RPS, but change the pattern: steady, bursty, or chaotic.
                        </p>
                         <div className="mt-3">
                            <select
                                className="form-select dropdown-menu-dark"
                                value={warpSpeed}
                                onChange={(e) => setWarpSpeed(e.target.value)}>
                                {WARP_SPEED_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                            <small className="text-muted">{warpCopy}</small>
                        </div>
                    </div>
                </div>

                <div className="col-4">
                    <div className="control-group mt-4">
                        <p className="d-flex align-items-center justify-content-between text-uppercase text-muted small mb-2">
                            Enable escort frigates
                            <div className="form-check form-switch m-0">
                                <input 
                                    className="form-check-input" 
                                    type="checkbox" 
                                    checked={escortEnabled} 
                                    onChange={(e) => setEscortEnabled(e.target.checked)}/>
                            </div>
                        </p>
                        <p className="mb-0 text-muted">
                            Applies Linkerd policy to add concurrency timeouts and retries to sketchy routes.
                        </p>
                    </div>
                </div>

                <div className="col-12">
                    <div className="control-group mt-4">
                        <p className="text-uppercase text-muted small mb-2">Mission profile</p>
                        <p className="mb-0 text-muted">
                            Define the source and destination of the traffic.
                        </p>
                        <div className="row g-3">
                            <div className="col-sm-6">
                                <label htmlFor="mission-source" className="form-label text-uppercase text-white-50 small mb-1">
                                    Source planet
                                </label>
                                <select
                                    id="mission-source"
                                    className="form-select dropdown-menu-dark"
                                    value={sourcePlanet}
                                    onChange={(e) => {
                                        const newSource = e.target.value;
                                        setSourcePlanet(newSource);
                                        if (newSource === destinationPlanet) {
                                            setDestinationPlanet(findAlternatePlanetId(newSource));
                                        }
                                    }}
                                >
                                    {PLANET_ROSTER.map((planet) => (
                                        <option key={planet.id} value={planet.id} disabled={planet.id === destinationPlanet}>
                                            {planet.displayName} — {planet.typeLabel}
                                        </option>
                                    ))}
                                </select>
                                {selectedSourcePlanet && (
                                    <div className="mission-planet-preview">
                                        <span className="mission-planet-thumb" aria-hidden="true">
                                            <img src={selectedSourcePlanet.image} alt={selectedSourcePlanet.typeLabel} />
                                        </span>
                                        <div>
                                            <p className="mb-0 text-uppercase">{selectedSourcePlanet.displayName}</p>
                                            <small className="text-white-50 d-block">{selectedSourcePlanet.typeLabel}</small>
                                            <small className="text-muted d-block">{selectedSourcePlanet.description}</small>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="col-sm-6">
                                <label htmlFor="mission-destination" className="form-label text-uppercase text-white-50 small mb-1">
                                    Destination planet
                                </label>
                                <select
                                    id="mission-destination"
                                    className="form-select dropdown-menu-dark"
                                    value={destinationPlanet}
                                    onChange={(e) => {
                                        const newDestination = e.target.value;
                                        setDestinationPlanet(newDestination);
                                        if (newDestination === sourcePlanet) {
                                            setSourcePlanet(findAlternatePlanetId(newDestination));
                                        }
                                    }}
                                >
                                    {PLANET_ROSTER.map((planet) => (
                                        <option key={planet.id} value={planet.id} disabled={planet.id === sourcePlanet}>
                                            {planet.displayName} — {planet.typeLabel}
                                        </option>
                                    ))}
                                </select>
                                {selectedDestinationPlanet && (
                                    <div className="mission-planet-preview">
                                        <span className="mission-planet-thumb" aria-hidden="true">
                                            <img src={selectedDestinationPlanet.image} alt={selectedDestinationPlanet.typeLabel} />
                                        </span>
                                        <div>
                                            <p className="mb-0 text-uppercase">{selectedDestinationPlanet.displayName}</p>
                                            <small className="text-white-50 d-block">{selectedDestinationPlanet.typeLabel}</small>
                                            <small className="text-muted d-block">{selectedDestinationPlanet.description}</small>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FleetCommand;
