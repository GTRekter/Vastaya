import React from 'react';

const ActiveMissions = ({ missions, onTerminate }) => {
    return (
        <div className="panel-card text-white">
            <div className="row align-items-lg-center justify-content-between">
                <div className="col-lg">
                    <p className="eyebrow text-uppercase">
                        🚀 Control the Fleet
                    </p>
                    <h2>
                        Active Missions
                    </h2>
                    <p className="text-muted">
                        Track load jobs already en route. Terminate to free up ships or reroute traffic.
                    </p>
                </div>
            </div>

            <div className="row align-items-lg-center justify-content-between">      
            {missions.length === 0 ? (
                <p className="text-white-50 mb-0 mt-3">No missions are currently in progress. Launch a fleet to start one.</p>
            ) : (
                <ul className="mission-list list-unstyled mb-0 mt-3">
                    {missions.map((mission) => (
                        <li key={mission.id} className="mission-card d-flex align-items-center justify-content-between">
                            <div className="d-flex align-items-center gap-3">
                                <div className="mission-card-planets d-flex align-items-center gap-2">
                                    <span className="mission-card-thumb">
                                        <img src={mission.source.image} alt={mission.source.typeLabel} />
                                    </span>
                                    <span className="mission-card-arrow" aria-hidden="true">→</span>
                                    <span className="mission-card-thumb">
                                        <img src={mission.destination.image} alt={mission.destination.typeLabel} />
                                    </span>
                                </div>
                                <div className="mission-card-route">
                                    <p className="mb-0 text-uppercase">
                                        {mission.source.displayName} → {mission.destination.displayName}
                                    </p>
                                    <small className="text-white-50 d-block">{mission.warpLabel}</small>
                                    <small className="text-muted d-block">
                                        Fleet size {mission.fleetSize} • Escorts {mission.escortEnabled ? 'on' : 'off'} • Launched {mission.startedAt}
                                    </small>
                                </div>
                            </div>
                            <button className="btn btn-sm btn-outline-danger" type="button" onClick={() => onTerminate(mission.id)}>
                                Terminate
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            </div>
        </div>
    );
};

export default ActiveMissions;
