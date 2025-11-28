import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PLANET_ROSTER } from '../data/planets';
import { fetchUniverseConfig, saveUniverseConfig, applyUniverseConfig } from '../services/universeApi';
import './universeBuilder.css';

const CROSS_GALAXY_MODES = {
    gateway: 'Gateway only — basic east/west exposure',
    mirrored: 'Mirrored services — async service mirror for failover',
    federated: 'Federated control planes — full multi-cluster mesh',
};

const PLANET_TEMPLATE = PLANET_ROSTER.map(({ id, code, displayName, type, description }) => ({
    id,
    code,
    displayName,
    type,
    description,
}));

const PLANET_VISUALS = PLANET_ROSTER.reduce((acc, planet) => {
    acc[planet.id] = { image: planet.image, typeLabel: planet.typeLabel };
    acc[planet.type] = { image: planet.image, typeLabel: planet.typeLabel };
    return acc;
}, {});

const DEFAULT_CONFIG = {
    crossGalaxyEnabled: true,
    crossGalaxyMode: 'gateway',
    wormholesEnabled: true,
    wormholeInstability: 20,
    nebulaEnabled: true,
    nebulaDensity: 35,
    shieldsEnabled: true,
    blackHoleEnabled: true,
    chaosExperimentsEnabled: true,
    planets: PLANET_TEMPLATE,
};

const STATUS_VARIANT = {
    success: 'success',
    error: 'danger',
    info: 'secondary',
};

const sanitizePlanets = (planets) => {
    if (!Array.isArray(planets) || planets.length === 0) {
        return PLANET_TEMPLATE;
    }

    return planets.map((planet, idx) => ({
        ...PLANET_TEMPLATE[idx % PLANET_TEMPLATE.length],
        ...planet,
    }));
};

const normalizeConfig = (incoming = {}) => ({
    ...DEFAULT_CONFIG,
    ...incoming,
    planets: sanitizePlanets(incoming.planets),
});

const formatTimestamp = (value) => {
    if (!value) {
        return null;
    }

    try {
        return new Date(value).toLocaleString();
    } catch (error) {
        return value;
    }
};

const UniverseBuilder = () => {
    const [config, setConfig] = useState(() => normalizeConfig(DEFAULT_CONFIG));
    const [isLoading, setIsLoading] = useState(true);
    const [isDeploying, setIsDeploying] = useState(false);
    const [status, setStatus] = useState(null);
    const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
    const [lastAppliedAt, setLastAppliedAt] = useState(null);

    const currentPlanets = useMemo(() => {
        if (!Array.isArray(config.planets) || config.planets.length === 0) {
            return PLANET_ROSTER;
        }

        return config.planets.map((planet, idx) => {
            const fallback = PLANET_ROSTER[idx % PLANET_ROSTER.length];
            const visuals = PLANET_VISUALS[planet.id] || PLANET_VISUALS[planet.type] || {
                image: fallback.image,
                typeLabel: fallback.typeLabel,
            };

            return {
                ...fallback,
                ...planet,
                typeLabel: visuals.typeLabel,
                image: visuals.image,
            };
        });
    }, [config.planets]);

    const updateConfig = useCallback((updates) => {
        setConfig((prev) => ({
            ...prev,
            ...updates,
        }));
    }, []);

    const refreshFromServer = useCallback(async ({ signal, silent } = {}) => {
        try {
            if (!silent) {
                setIsLoading(true);
            }
            const data = await fetchUniverseConfig({ signal });
            const nextConfig = normalizeConfig(data?.config ?? data);
            setConfig(nextConfig);
            setLastUpdatedAt(data?.lastUpdatedAt ?? new Date().toISOString());
            setLastAppliedAt(data?.lastAppliedAt ?? data?.lastApplyResult?.appliedAt ?? null);
            if (!silent) {
                setStatus({ type: 'info', message: 'Loaded current universe config.' });
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                return;
            }
            if (!silent) {
                setStatus({ type: 'error', message: error.message || 'Failed to load universe config.' });
            }
        } finally {
            if (!silent) {
                setIsLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        refreshFromServer({ signal: controller.signal });
        return () => controller.abort();
    }, [refreshFromServer]);

    const handleDeploy = async () => {
        setIsDeploying(true);
        setStatus(null);
        try {
            const saved = await saveUniverseConfig(config);
            const savedConfig = normalizeConfig(saved?.config ?? saved);
            setConfig(savedConfig);
            setLastUpdatedAt(saved?.lastUpdatedAt ?? new Date().toISOString());

            const applyResponse = await applyUniverseConfig();
            setLastAppliedAt(applyResponse?.appliedAt ?? null);
            setStatus({ type: 'success', message: 'Config saved and apply triggered.' });
            await refreshFromServer({ silent: true });
        } catch (error) {
            setStatus({ type: 'error', message: error.message || 'Failed to deploy galaxy.' });
        } finally {
            setIsDeploying(false);
        }
    };

    const handleRefresh = () => {
        if (!isLoading) {
            refreshFromServer();
        }
    };

    const controlsDisabled = isLoading || isDeploying;

    return (
        <div className="panel-card text-white">
            <div className="row align-items-lg-center justify-content-between">
                <div className="col-lg">
                    <p className="eyebrow text-uppercase">
                        🪐 Build Your Tiny Universe
                    </p>
                    <h2>
                        Universe Builder
                    </h2>
                    <p className="text-muted">
                        Translate playful controls directly into Kubernetes deployments, Linkerd policies, and chaos levers.
                    </p>
                </div>
                <div className="col-lg-auto d-flex align-items-center gap-2">
                    <button className="btn btn-outline-light" type="button" onClick={handleRefresh} disabled={controlsDisabled}>
                        {isLoading ? 'Syncing…' : 'Refresh config'}
                    </button>
                    <button className="btn btn-primary" type="button" onClick={handleDeploy} disabled={controlsDisabled}>
                        {isDeploying ? 'Deploying…' : 'Deploy my galaxy ✨'}
                    </button>
                </div>
            </div>

            {(lastUpdatedAt || lastAppliedAt) && (
                <div className="row mt-3">
                    <div className="col">
                        <p className="small text-muted mb-0">
                            {lastUpdatedAt && (<span>Last saved: {formatTimestamp(lastUpdatedAt)}.</span>)}
                            {' '}
                            {lastAppliedAt && (<span>Last applied: {formatTimestamp(lastAppliedAt)}.</span>)}
                        </p>
                    </div>
                </div>
            )}

            {status && (
                <div className={`alert alert-${STATUS_VARIANT[status.type] || 'secondary'} mt-3`} role="alert">
                    {status.message}
                </div>
            )}

            <div className="row">
                <div className="col-12">
                    <div className="control-group mt-4">
                        <p className="text-uppercase text-muted small mb-2">Planet roster</p>
                        <p className="mb-0 text-muted">
                            This mission automatically provisions four preset planets. Configurations are fixed for demo consistency.
                        </p>
                        <ul className="list-unstyled mb-0">
                            {currentPlanets.map((planet) => (
                                <li key={planet.id} className="d-flex justify-content-between align-items-center py-3">
                                    <div className="d-flex align-items-center gap-3">
                                        <span className="planet-thumb" aria-hidden="true">
                                            <img src={planet.image} alt={planet.typeLabel || 'Planet render'} />
                                        </span>
                                        <div>
                                            <p className="mb-0 text-uppercase">
                                                {planet.displayName}
                                            </p>
                                            <small className="text-white-50 d-block">{planet.typeLabel}</small>
                                            <small className="text-muted d-block">{planet.description}</small>
                                        </div>
                                    </div>
                                    <span className="badge bg-secondary text-uppercase">Fixed</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="col-4">
                    <div className="control-group mt-4">
                        <p className="d-flex align-items-center justify-content-between text-uppercase text-muted small mb-2">
                            Cross-galaxy gateway fleet
                            <div className="form-check form-switch m-0">
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    checked={config.crossGalaxyEnabled}
                                    onChange={(e) => updateConfig({ crossGalaxyEnabled: e.target.checked })}
                                    disabled={controlsDisabled}
                                />
                            </div>
                        </p>
                        <p className="mb-0 text-muted">
                            Toggle Linkerd multi-cluster gateways plus service mirroring for cross-galaxy traffic.
                        </p>
                        {config.crossGalaxyEnabled && (
                            <div className="mt-3">
                                <select
                                    id="cross-galaxy-mode"
                                    className="form-select dropdown-menu-dark"
                                    value={config.crossGalaxyMode}
                                    onChange={(e) => updateConfig({ crossGalaxyMode: e.target.value })}
                                    disabled={controlsDisabled}
                                >
                                    <option value="gateway">Gateway</option>
                                    <option value="mirrored">Mirrored</option>
                                    <option value="federated">Federated</option>
                                </select>
                                <div className="form-text text-muted">{CROSS_GALAXY_MODES[config.crossGalaxyMode]}</div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="col-4">
                    <div className="control-group mt-4">
                        <p className="d-flex align-items-center justify-content-between text-uppercase text-muted small mb-2">
                            Enable wormhole experiments
                            <div className="form-check form-switch m-0">
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    checked={config.wormholesEnabled}
                                    onChange={(e) => updateConfig({ wormholesEnabled: e.target.checked })}
                                    disabled={controlsDisabled}
                                />
                            </div>
                        </p>
                        <p className="mb-0 text-muted">
                            Translates to Linkerd TrafficSplit (planet-trade v1/v2) with v2 receiving {config.wormholesEnabled ? config.wormholeInstability : 0}%.
                        </p>
                        {config.wormholesEnabled && (
                            <div className="mt-3">
                                <label className="form-label">Wormhole instability: <strong>{config.wormholeInstability}%</strong></label>
                                <input
                                    className="form-range"
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={config.wormholeInstability}
                                    onChange={(e) => updateConfig({ wormholeInstability: Number(e.target.value) })}
                                    disabled={controlsDisabled}
                                />
                            </div>
                        )}
                    </div>
                </div>

                <div className="col-4">
                    <div className="control-group mt-4">
                        <p className="d-flex align-items-center justify-content-between text-uppercase text-muted small mb-2">
                            Nebula density
                            <div className="form-check form-switch m-0">
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    checked={config.nebulaEnabled}
                                    onChange={(e) => updateConfig({ nebulaEnabled: e.target.checked })}
                                    disabled={controlsDisabled}
                                />
                            </div>
                        </p>
                        <p className="mb-0 text-muted">
                            Translates to latency across the fleet by {config.nebulaEnabled ? config.nebulaDensity : 0} ms.
                        </p>
                        {config.nebulaEnabled && (
                            <div className="mt-3">
                                <label className="form-label">Nebula density: <strong>{config.nebulaDensity}</strong></label>
                                <input
                                    className="form-range"
                                    type="range"
                                    min="0"
                                    max="10000"
                                    value={config.nebulaDensity}
                                    onChange={(e) => updateConfig({ nebulaDensity: Number(e.target.value) })}
                                    disabled={controlsDisabled}
                                />
                            </div>
                        )}
                    </div>
                </div>

                <div className="col-4">
                    <div className="control-group mt-4">
                        <p className="d-flex align-items-center justify-content-between text-uppercase text-muted small mb-2">
                            Activate planetary shields (mTLS)
                            <div className="form-check form-switch m-0">
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    checked={config.shieldsEnabled}
                                    onChange={(e) => updateConfig({ shieldsEnabled: e.target.checked })}
                                    disabled={controlsDisabled}
                                />
                            </div>
                        </p>
                        <p className="mb-0 text-muted">
                            Flip Linkerd injection that will protect your planets.
                        </p>
                    </div>
                </div>

                <div className="col-4">
                    <div className="control-group mt-4">
                        <p className="d-flex align-items-center justify-content-between text-uppercase text-muted small mb-2">
                            Black hole events
                            <div className="form-check form-switch m-0">
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    checked={config.blackHoleEnabled}
                                    onChange={(e) => updateConfig({ blackHoleEnabled: e.target.checked })}
                                    disabled={controlsDisabled}
                                />
                            </div>
                        </p>
                        <p className="mb-0 text-muted">
                            Generate black holes that will randomly absorb your planets.
                        </p>
                    </div>
                </div>

                <div className="col-4">
                    <div className="control-group mt-4">
                        <p className="d-flex align-items-center justify-content-between text-uppercase text-muted small mb-2">
                            Chaos experiments
                            <div className="form-check form-switch m-0">
                                <input
                                    className="form-check-input"
                                    type="checkbox"
                                    checked={config.chaosExperimentsEnabled}
                                    onChange={(e) => updateConfig({ chaosExperimentsEnabled: e.target.checked })}
                                    disabled={controlsDisabled}
                                />
                            </div>
                        </p>
                        <p className="mb-0 text-muted">
                            Globally enable or pause failure injection workflows across all fleets.
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default UniverseBuilder;
