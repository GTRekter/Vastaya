import { useState, useEffect, useRef } from 'react';
import { fetchMissionLogs } from '../services/fleetApi';

const ActiveMissions = ({ missions, onTerminate }) => {
    const [expandedId, setExpandedId] = useState(null);
    const [selectedRole, setSelectedRole] = useState(null); // 'source' | 'destination'
    const [logLines, setLogLines] = useState([]);
    const [logsError, setLogsError] = useState(null);
    const logsEndRef = useRef(null);

    const selectPlanetLogs = (missionId, role) => {
        if (expandedId === missionId && selectedRole === role) {
            setExpandedId(null);
            setSelectedRole(null);
        } else {
            setLogLines([]);
            setLogsError(null);
            setExpandedId(missionId);
            setSelectedRole(role);
        }
    };

    useEffect(() => {
        if (!expandedId || !selectedRole) return;

        let cancelled = false;

        const load = async () => {
            try {
                const data = await fetchMissionLogs(expandedId);
                if (!cancelled) {
                    const all = data?.lines || [];
                    setLogLines(all.filter(l => l.role === selectedRole));
                    setLogsError(null);
                }
            } catch (err) {
                if (!cancelled) setLogsError(err.message);
            }
        };

        load();
        const intervalId = setInterval(load, 3000);
        return () => {
            cancelled = true;
            clearInterval(intervalId);
        };
    }, [expandedId, selectedRole]);

    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logLines]);

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
                        <li key={mission.id} className="mission-card">
                            <div className="d-flex align-items-center justify-content-between">
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
                                <div className="d-flex gap-2 align-items-center">
                                    <div className="dropdown">
                                        <button
                                            className={`btn btn-sm dropdown-toggle ${expandedId === mission.id ? 'btn-secondary' : 'btn-outline-secondary'}`}
                                            type="button"
                                            data-bs-toggle="dropdown"
                                            aria-expanded="false"
                                        >
                                            Logs
                                        </button>
                                        <ul className="dropdown-menu dropdown-menu-dark dropdown-menu-end">
                                            <li>
                                                <button
                                                    className={`dropdown-item ${expandedId === mission.id && selectedRole === 'source' ? 'active' : ''}`}
                                                    type="button"
                                                    onClick={() => selectPlanetLogs(mission.id, 'source')}
                                                >
                                                    {mission.source.displayName || mission.source.id}
                                                </button>
                                            </li>
                                            <li>
                                                <button
                                                    className={`dropdown-item ${expandedId === mission.id && selectedRole === 'destination' ? 'active' : ''}`}
                                                    type="button"
                                                    onClick={() => selectPlanetLogs(mission.id, 'destination')}
                                                >
                                                    {mission.destination.displayName || mission.destination.id}
                                                </button>
                                            </li>
                                        </ul>
                                    </div>
                                    <button className="btn btn-sm btn-outline-danger" type="button" onClick={() => onTerminate(mission.id)}>
                                        Terminate
                                    </button>
                                </div>
                            </div>
                            {expandedId === mission.id && selectedRole && (
                                <div className="mission-logs mt-2">
                                    {logsError ? (
                                        <p className="text-danger small mb-0">{logsError}</p>
                                    ) : logLines.length === 0 ? (
                                        <div className="mission-logs-terminal">
                                            <span className="text-white-50 small">Fetching logs…</span>
                                        </div>
                                    ) : (
                                        <div className="mission-logs-terminal">
                                            {logLines.map((line, i) => (
                                                <div key={i} className="mission-log-line">
                                                    <span className="log-source">[{line.source}]</span>{' '}
                                                    <span className="log-text">{line.text}</span>
                                                </div>
                                            ))}
                                            <div ref={logsEndRef} />
                                        </div>
                                    )}
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            </div>
        </div>
    );
};

export default ActiveMissions;
