import React, { Component } from 'react';
import GalaxiesService from '../services/GalaxiesService';
import PlanetsService from '../services/PlanetsService';
import './galaxies.css';

import galaxyImage1 from '../images/galaxies/1.png';
import galaxyImage2 from '../images/galaxies/2.png';
import galaxyImage3 from '../images/galaxies/3.png';
import galaxyImage4 from '../images/galaxies/4.png';

const galaxyImages = [galaxyImage1, galaxyImage2, galaxyImage3, galaxyImage4];
const KUBERNETES_NAMESPACE_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

const createDefaultPlanetForm = () => ({
    name: '',
    replicas: 1,
    internalDelayMs: '0',
    error: null,
    isSubmitting: false,
});

const createDefaultTrafficConfig = () => ({
    protocol: 'http',
    target: '',
    requestsPerSecond: '1',
    method: 'POST',
    payload: '',
    headersJson: '',
    requestTimeoutMs: '15000',
    allowInsecureHttp2: false,
});

const createDefaultTrafficPanelState = () => ({
    config: createDefaultTrafficConfig(),
    status: null,
    error: null,
    isSubmitting: false,
    isStatusLoading: false,
});

export default class Galaxies extends Component {
    state = {
        galaxies: [],
        activeGalaxyId: null,
        showCreateModal: false,
        newGalaxy: {
            name: '',
            status: 'active',
        },
        createError: null,
        isCreating: false,
        nextImageIndex: 0,
        planetsByGalaxy: {},
        planetLoading: {},
        planetErrors: {},
        planetForms: {},
        trafficPanels: {},
        activeTrafficGalaxyId: null,
        activeTrafficPlanetId: null,
        planetStatusUpdating: {},
    };

    constructor(props) {
        super(props);
        this.onClickViewGalaxy = this.onClickViewGalaxy.bind(this);
        this.onClickEditGalaxy = this.onClickEditGalaxy.bind(this);
        this.onClickDeleteGalaxy = this.onClickDeleteGalaxy.bind(this);
    }

    componentDidMount() {
        console.log("Fetching galaxies from the API");
        console.log("API URL:", process.env.REACT_APP_GALAXIES_API_URL);
        GalaxiesService.getGalaxies()
            .then(galaxies => {
                const enrichedGalaxies = galaxies.map((galaxy, index) => ({
                    ...galaxy,
                    image: galaxy.image || galaxyImages[index % galaxyImages.length],
                }));

                this.setState({
                    galaxies: enrichedGalaxies,
                    nextImageIndex: galaxies.length % galaxyImages.length,
                });
            })
            .catch(error => console.error('Error fetching galaxies:', error));
    }

    onClickViewGalaxy(galaxyId) {
        console.log("View galaxy", galaxyId);
        this.props.history.push(`/galaxies/${galaxyId}`);
    }

    onClickEditGalaxy(galaxyId) {
        console.log("Edit galaxy", galaxyId);
    }

    onClickDeleteGalaxy(galaxyId) {
        console.log("Delete galaxy", galaxyId);
    }

    toggleAccordion = (galaxyId) => {
        this.setState(
            prevState => ({
                activeGalaxyId: prevState.activeGalaxyId === galaxyId ? null : galaxyId,
            }),
            () => {
                const { activeGalaxyId, planetsByGalaxy, planetLoading } = this.state;
                if (
                    activeGalaxyId === galaxyId &&
                    !planetsByGalaxy[galaxyId] &&
                    !planetLoading[galaxyId]
                ) {
                    this.fetchPlanets(galaxyId);
                }
                this.ensurePlanetForm(galaxyId);
            }
        );
    };

    openCreateModal = () => {
        this.setState({
            showCreateModal: true,
            createError: null,
        });
    };

    fetchPlanets = (galaxyId) => {
        this.setState(prevState => ({
            planetLoading: { ...prevState.planetLoading, [galaxyId]: true },
            planetErrors: { ...prevState.planetErrors, [galaxyId]: null },
        }));

        PlanetsService.getPlanetsByGalaxyId(galaxyId)
            .then(planets => {
                this.setState(prevState => ({
                    planetsByGalaxy: { ...prevState.planetsByGalaxy, [galaxyId]: planets },
                    planetLoading: { ...prevState.planetLoading, [galaxyId]: false },
                }));
            })
            .catch(error => {
                this.setState(prevState => ({
                    planetLoading: { ...prevState.planetLoading, [galaxyId]: false },
                    planetErrors: {
                        ...prevState.planetErrors,
                        [galaxyId]: error.message || 'Failed to load planets. Please try again.',
                    },
                }));
            });
    };

    ensurePlanetForm = (galaxyId) => {
        if (!galaxyId) {
            return;
        }

        this.setState(prevState => {
            if (prevState.planetForms[galaxyId]) {
                return null;
            }

            return {
                planetForms: {
                    ...prevState.planetForms,
                    [galaxyId]: createDefaultPlanetForm(),
                },
            };
        });
    };

    handlePlanetFormChange = (galaxyId, field, value) => {
        this.ensurePlanetForm(galaxyId);
        this.setState(prevState => {
            const previousForm =
                prevState.planetForms[galaxyId] || createDefaultPlanetForm();
            return {
                planetForms: {
                    ...prevState.planetForms,
                    [galaxyId]: {
                        ...previousForm,
                        [field]: value,
                    },
                },
            };
        });
    };

    ensureTrafficPanel = (planetId) => {
        if (!planetId) {
            return;
        }

        this.setState(prevState => {
            if (prevState.trafficPanels[planetId]) {
                return null;
            }

            return {
                trafficPanels: {
                    ...prevState.trafficPanels,
                    [planetId]: createDefaultTrafficPanelState(),
                },
            };
        });
    };

    getPlanetFromState = (galaxyId, planetId) => {
        const planets = this.state.planetsByGalaxy[galaxyId];
        if (!planets) {
            return null;
        }
        return planets.find(planet => planet.id === planetId) || null;
    };

    handleSelectPlanetForTraffic = (galaxyId, planetId) => {
        if (!galaxyId || !planetId) {
            return;
        }

        this.ensureTrafficPanel(planetId);
        this.setState(
            {
                activeTrafficGalaxyId: galaxyId,
                activeTrafficPlanetId: planetId,
            },
            () => {
                this.refreshTrafficStatus(galaxyId, planetId);
            }
        );
    };

    handleTrafficConfigChange = (planetId, field, value) => {
        this.ensureTrafficPanel(planetId);
        this.setState(prevState => {
            const previousPanel =
                prevState.trafficPanels[planetId] || createDefaultTrafficPanelState();
            const currentConfig = previousPanel.config || createDefaultTrafficConfig();
            const nextValue =
                field === 'protocol' && typeof value === 'string'
                    ? value.toLowerCase()
                    : value;

            return {
                trafficPanels: {
                    ...prevState.trafficPanels,
                    [planetId]: {
                        ...previousPanel,
                        config: {
                            ...currentConfig,
                            [field]: nextValue,
                        },
                    },
                },
            };
        });
    };

    setTrafficPanelState = (planetId, updater) => {
        this.setState(prevState => {
            const previousPanel =
                prevState.trafficPanels[planetId] || createDefaultTrafficPanelState();
            return {
                trafficPanels: {
                    ...prevState.trafficPanels,
                    [planetId]: {
                        ...previousPanel,
                        ...updater(previousPanel),
                    },
                },
            };
        });
    };

    refreshTrafficStatus = (galaxyId, planetId) => {
        const planet = this.getPlanetFromState(galaxyId, planetId);
        if (!planet) {
            return;
        }

        this.setTrafficPanelState(planetId, () => ({
            isStatusLoading: true,
            error: null,
        }));

        PlanetsService.getPlanetTrafficStatus(galaxyId, planet)
            .then(status => {
                this.setTrafficPanelState(planetId, () => ({
                    status,
                    isStatusLoading: false,
                    error: null,
                }));
            })
            .catch(error => {
                this.setTrafficPanelState(planetId, () => ({
                    isStatusLoading: false,
                    status: null,
                    error:
                        (error && error.message) ||
                        'Unable to load traffic status. The worker may not be ready yet.',
                }));
            });
    };

    buildTrafficPayload = (planetId) => {
        const panel = this.state.trafficPanels[planetId] || createDefaultTrafficPanelState();
        const config = panel.config || createDefaultTrafficConfig();

        const supportedProtocols = ['http', 'http2', 'grpc'];
        const protocol =
            typeof config.protocol === 'string'
                ? config.protocol.toLowerCase()
                : 'http';
        if (!supportedProtocols.includes(protocol)) {
            throw new Error('Traffic protocol must be HTTP, HTTP/2, or gRPC.');
        }

        const target = (config.target || '').trim();
        if (!target) {
            throw new Error('Traffic target endpoint is required.');
        }

        const rpsValue = Number.parseFloat(config.requestsPerSecond);
        if (!Number.isFinite(rpsValue) || rpsValue <= 0) {
            throw new Error('Requests per second must be greater than zero.');
        }

        const timeoutValue = Number.parseInt(config.requestTimeoutMs, 10);
        const requestTimeoutMs =
            Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : 15000;

        const methodValue = (
            (config.method || 'POST').trim() || 'POST'
        ).toUpperCase();
        const payloadString = config.payload || '';
        const headersRaw = config.headersJson || '';

        let headersObject = undefined;
        if (headersRaw.trim().length > 0) {
            const parsed = JSON.parse(headersRaw);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('Headers must be a JSON object (e.g. {"X-Example": "value"}).');
            }
            headersObject = parsed;
        }

        const allowInsecureHttp2 = Boolean(config.allowInsecureHttp2);

        const payload = {
            protocol,
            target,
            requestsPerSecond: rpsValue,
            requestTimeoutMs,
        };

        if (protocol === 'http' || protocol === 'http2') {
            payload.method = methodValue || 'POST';
        }

        if (headersObject) {
            payload.headers = headersObject;
        }

        if (payloadString.trim().length > 0) {
            payload.payload = payloadString;
        }

        if (protocol === 'http2' && allowInsecureHttp2) {
            payload.allowInsecureHttp2 = true;
        }

        return payload;
    };

    handleStartTraffic = (galaxyId, planetId) => {
        const planet = this.getPlanetFromState(galaxyId, planetId);
        if (!planet) {
            return;
        }

        let payload;
        try {
            payload = this.buildTrafficPayload(planetId);
        } catch (err) {
            const error = err instanceof Error ? err.message : 'Invalid traffic configuration.';
            this.setTrafficPanelState(planetId, () => ({
                error,
            }));
            return;
        }

        this.setTrafficPanelState(planetId, () => ({
            isSubmitting: true,
            error: null,
        }));

        PlanetsService.startPlanetTraffic(galaxyId, planet, payload)
            .then(() => {
                this.refreshTrafficStatus(galaxyId, planetId);
                this.setTrafficPanelState(planetId, () => ({
                    isSubmitting: false,
                    error: null,
                }));
            })
            .catch(error => {
                this.setTrafficPanelState(planetId, () => ({
                    isSubmitting: false,
                    error:
                        (error && error.message) ||
                        'Unable to start traffic. Please verify the configuration.',
                }));
            });
    };

    handleStopTraffic = (galaxyId, planetId) => {
        const planet = this.getPlanetFromState(galaxyId, planetId);
        if (!planet) {
            return;
        }

        this.setTrafficPanelState(planetId, () => ({
            isSubmitting: true,
            error: null,
        }));

        PlanetsService.stopPlanetTraffic(galaxyId, planet)
            .then(() => {
                this.refreshTrafficStatus(galaxyId, planetId);
                this.setTrafficPanelState(planetId, () => ({
                    isSubmitting: false,
                    error: null,
                }));
            })
            .catch(error => {
                this.setTrafficPanelState(planetId, () => ({
                    isSubmitting: false,
                    error:
                        (error && error.message) ||
                        'Unable to stop traffic. Please try again.',
                }));
            });
    };

    handleUpdatePlanetStatus = (galaxyId, planetId, status) => {
        if (!galaxyId || !planetId || !status) {
            return;
        }

        this.setState(prevState => ({
            planetStatusUpdating: {
                ...prevState.planetStatusUpdating,
                [planetId]: true,
            },
            planetErrors: {
                ...prevState.planetErrors,
                [galaxyId]: null,
            },
        }));

        PlanetsService.updatePlanetStatus(galaxyId, planetId, { status })
            .then(updatedPlanet => {
                this.setState(prevState => {
                    const planets = (prevState.planetsByGalaxy[galaxyId] || []).map(planet =>
                        planet.id === planetId ? { ...planet, ...updatedPlanet } : planet
                    );
                    const nextStatusUpdating = { ...prevState.planetStatusUpdating };
                    delete nextStatusUpdating[planetId];
                    return {
                        planetsByGalaxy: {
                            ...prevState.planetsByGalaxy,
                            [galaxyId]: planets,
                        },
                        planetStatusUpdating: nextStatusUpdating,
                        planetErrors: {
                            ...prevState.planetErrors,
                            [galaxyId]: null,
                        },
                    };
                });
            })
            .catch(error => {
                this.setState(prevState => {
                    const nextStatusUpdating = { ...prevState.planetStatusUpdating };
                    delete nextStatusUpdating[planetId];
                    return {
                        planetStatusUpdating: nextStatusUpdating,
                        planetErrors: {
                            ...prevState.planetErrors,
                            [galaxyId]:
                                (error && error.message) ||
                                'Failed to update planet status. Please try again.',
                        },
                    };
                });
            });
    };

    renderTrafficManagerPanel = (galaxyId, planetId) => {
        const planet = this.getPlanetFromState(galaxyId, planetId);
        if (!planet) {
            return null;
        }

        const panel =
            this.state.trafficPanels[planetId] || createDefaultTrafficPanelState();
        const config = panel.config || createDefaultTrafficConfig();
        const normalizedProtocol = (config.protocol || 'http').toLowerCase();
        const isHttpProtocol =
            normalizedProtocol === 'http' || normalizedProtocol === 'http2';
        const isHttp2 = normalizedProtocol === 'http2';
        const status = panel.status;
        const isRunning = Boolean(status?.active);

        return (
            <div className="card bg-dark border border-secondary mt-4">
                <div className="card-body text-white">
                    <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center gap-3 mb-3">
                        <div>
                            <h4 className="h5 mb-1">
                                Traffic Manager — {planet.name} ({planet.id})
                            </h4>
                            <small className="text-white-50">
                                Worker service: {planet.serviceName}.{galaxyId}.svc.cluster.local:{' '}
                                {planet.httpPort}
                            </small>
                        </div>
                        <div className="d-flex gap-2">
                            <button
                                type="button"
                                className="btn btn-outline-light"
                                disabled={panel.isSubmitting}
                                onClick={() => this.refreshTrafficStatus(galaxyId, planetId)}
                            >
                                {panel.isStatusLoading ? 'Refreshing...' : 'Refresh Status'}
                            </button>
                            <button
                                type="button"
                                className="btn btn-success"
                                disabled={panel.isSubmitting}
                                onClick={() => this.handleStartTraffic(galaxyId, planetId)}
                            >
                                {panel.isSubmitting ? 'Starting...' : 'Start Traffic'}
                            </button>
                            <button
                                type="button"
                                className="btn btn-warning"
                                disabled={panel.isSubmitting || !isRunning}
                                onClick={() => this.handleStopTraffic(galaxyId, planetId)}
                            >
                                {panel.isSubmitting ? 'Stopping...' : 'Stop Traffic'}
                            </button>
                        </div>
                    </div>

                    {panel.error && (
                        <div className="alert alert-danger py-2" role="alert">
                            {panel.error}
                        </div>
                    )}

                    <div className="row g-3">
                        <div className="col-12 col-md-4">
                            <label className="form-label text-white-50">Protocol</label>
                            <select
                                className="form-select"
                                value={config.protocol}
                                onChange={event =>
                                    this.handleTrafficConfigChange(
                                        planetId,
                                        'protocol',
                                        event.target.value
                                    )
                                }
                            >
                                <option value="http">HTTP</option>
                                <option value="http2">HTTP/2</option>
                                <option value="grpc">gRPC</option>
                            </select>
                        </div>
                        <div className="col-12 col-md-8">
                            <label className="form-label text-white-50">Target Endpoint</label>
                            <input
                                type="text"
                                className="form-control"
                                value={config.target}
                                onChange={event =>
                                    this.handleTrafficConfigChange(
                                        planetId,
                                        'target',
                                        event.target.value
                                    )
                                }
                                required
                            />
                            <small className="form-text text-white-50">
                                Use host:port for gRPC targets or a full URL for HTTP-based protocols.
                            </small>
                        </div>
                        <div className="col-12 col-md-4">
                            <label className="form-label text-white-50">Requests / Second</label>
                            <input
                                type="number"
                                min="0.001"
                                step="0.001"
                                className="form-control"
                                value={config.requestsPerSecond}
                                onChange={event =>
                                    this.handleTrafficConfigChange(
                                        planetId,
                                        'requestsPerSecond',
                                        event.target.value
                                    )
                                }
                                required
                            />
                        </div>
                        {isHttpProtocol && (
                            <div className="col-12 col-md-4">
                                <label className="form-label text-white-50">HTTP Method</label>
                                <select
                                    className="form-select"
                                    value={config.method}
                                    onChange={event =>
                                        this.handleTrafficConfigChange(
                                            planetId,
                                            'method',
                                            event.target.value
                                        )
                                    }
                                >
                                    <option value="POST">POST</option>
                                    <option value="GET">GET</option>
                                    <option value="PUT">PUT</option>
                                    <option value="PATCH">PATCH</option>
                                    <option value="DELETE">DELETE</option>
                                </select>
                            </div>
                        )}
                        <div className={`col-12 col-md-${isHttpProtocol ? '4' : '6'}`}>
                            <label className="form-label text-white-50">Request Timeout (ms)</label>
                            <input
                                type="number"
                                min="1000"
                                step="500"
                                className="form-control"
                                value={config.requestTimeoutMs}
                                onChange={event =>
                                    this.handleTrafficConfigChange(
                                        planetId,
                                        'requestTimeoutMs',
                                        event.target.value
                                    )
                                }
                            />
                        </div>
                        <div className="col-12">
                            <label className="form-label text-white-50">Payload (optional)</label>
                            <textarea
                                className="form-control"
                                rows="3"
                                value={config.payload}
                                onChange={event =>
                                    this.handleTrafficConfigChange(
                                        planetId,
                                        'payload',
                                        event.target.value
                                    )
                                }
                            />
                        </div>
                        <div className="col-12">
                            <label className="form-label text-white-50">
                                Headers JSON (optional)
                            </label>
                            <textarea
                                className="form-control"
                                rows="3"
                                value={config.headersJson}
                                placeholder='{"X-Example": "value"}'
                                onChange={event =>
                                    this.handleTrafficConfigChange(
                                        planetId,
                                        'headersJson',
                                        event.target.value
                                    )
                                }
                            />
                            <small className="form-text text-white-50">
                                Provide key/value pairs as a JSON object.
                            </small>
                        </div>
                        {isHttp2 && (
                            <div className="col-12">
                                <div className="form-check">
                                    <input
                                        className="form-check-input"
                                        type="checkbox"
                                        id={`allowInsecure-${planetId}`}
                                        checked={Boolean(config.allowInsecureHttp2)}
                                        onChange={event =>
                                            this.handleTrafficConfigChange(
                                                planetId,
                                                'allowInsecureHttp2',
                                                event.target.checked
                                            )
                                        }
                                    />
                                    <label
                                        className="form-check-label text-white-50"
                                        htmlFor={`allowInsecure-${planetId}`}
                                    >
                                        Allow insecure HTTP/2 (skip TLS validation)
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="mt-4">
                        <h5 className="h6 text-white-50 text-uppercase">Latest Status</h5>
                        {panel.isStatusLoading ? (
                            <p className="text-white-50 mb-0">Loading status...</p>
                        ) : status ? (
                            <div className="bg-black bg-opacity-25 rounded-3 p-3">
                                <div className="d-flex flex-wrap gap-3">
                                    <span className={`badge ${isRunning ? 'bg-success' : 'bg-secondary'}`}>
                                        {isRunning ? 'Running' : 'Stopped'}
                                    </span>
                                    {status?.config && (
                                        <span className="text-white-50">
                                            Target: {status.config.target || 'n/a'}
                                        </span>
                                    )}
                                    {status?.stats && (
                                        <span className="text-white-50">
                                            Attempts: {status.stats.totalAttempts ?? 0} · Success:{' '}
                                            {status.stats.totalSuccess ?? 0} · Errors:{' '}
                                            {status.stats.totalErrors ?? 0}
                                        </span>
                                    )}
                                </div>
                                <pre className="mt-3 text-white-50 small overflow-auto">
{JSON.stringify(status, null, 2)}
                                </pre>
                            </div>
                        ) : (
                            <p className="text-white-50 mb-0">
                                No status available yet. Start the traffic generator to view runtime details.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    handleCreatePlanet = (event, galaxyId) => {
        event.preventDefault();
        this.ensurePlanetForm(galaxyId);

        const currentForm =
            this.state.planetForms[galaxyId] || createDefaultPlanetForm();

        const setFormError = (message) => {
            this.setState(prevState => {
                const previousForm =
                    prevState.planetForms[galaxyId] || createDefaultPlanetForm();
                return {
                    planetForms: {
                        ...prevState.planetForms,
                        [galaxyId]: {
                            ...previousForm,
                            isSubmitting: false,
                            error: message,
                        },
                    },
                };
            });
        };

        const trimmedName = currentForm.name.trim();
        if (!trimmedName) {
            setFormError('Planet name is required.');
            return;
        }

        const replicasValue = Number.parseInt(currentForm.replicas, 10);
        const sanitizedReplicas = Number.isNaN(replicasValue)
            ? 1
            : Math.max(1, replicasValue);

        const delayValue = Number.parseInt(currentForm.internalDelayMs, 10);
        const sanitizedDelay =
            Number.isNaN(delayValue) || delayValue < 0 ? 0 : delayValue;

        const planetPayload = {
            name: trimmedName,
            replicas: sanitizedReplicas,
            responseDelayMs: sanitizedDelay,
        };

        this.setState(prevState => {
            const previousForm =
                prevState.planetForms[galaxyId] || createDefaultPlanetForm();
            return {
                planetForms: {
                    ...prevState.planetForms,
                    [galaxyId]: {
                        ...previousForm,
                        isSubmitting: true,
                        error: null,
                    },
                },
            };
        });

        PlanetsService.createPlanet(galaxyId, planetPayload)
            .then(planet => {
                this.setState(prevState => {
                    const existingPlanets = prevState.planetsByGalaxy[galaxyId] || [];
                    const resetForm = {
                        ...createDefaultPlanetForm(),
                        replicas: sanitizedReplicas,
                    };
                    return {
                        planetsByGalaxy: {
                            ...prevState.planetsByGalaxy,
                            [galaxyId]: [...existingPlanets, planet],
                        },
                        planetForms: {
                            ...prevState.planetForms,
                            [galaxyId]: resetForm,
                        },
                    };
                });
            })
            .catch(error => {
                this.setState(prevState => {
                    const previousForm =
                        prevState.planetForms[galaxyId] || createDefaultPlanetForm();
                    return {
                        planetForms: {
                            ...prevState.planetForms,
                            [galaxyId]: {
                                ...previousForm,
                                isSubmitting: false,
                                error:
                                    (error && error.message) ||
                                    'Unable to create planet. Please try again.',
                            },
                        },
                    };
                });
            });
    };

    closeCreateModal = () => {
        this.setState({
            showCreateModal: false,
            createError: null,
            newGalaxy: {
                name: '',
                status: 'active',
            },
        });
    };

    handleNewGalaxyChange = (field, value) => {
        this.setState(prevState => ({
            newGalaxy: {
                ...prevState.newGalaxy,
                [field]: value,
            },
        }));
    };

    handleCreateGalaxy = (event) => {
        event.preventDefault();

        const { newGalaxy } = this.state;
        const trimmedName = newGalaxy.name.trim();

        if (!trimmedName) {
            this.setState({
                createError: 'Galaxy name is required.',
            });
            return;
        }

        if (!KUBERNETES_NAMESPACE_PATTERN.test(trimmedName)) {
            this.setState({
                createError: 'Galaxy name must use lowercase letters, numbers, or dashes (Kubernetes namespace format).',
            });
            return;
        }

        const payload = {
            name: trimmedName,
            status: newGalaxy.status,
        };

        this.setState({ isCreating: true, createError: null });

        GalaxiesService.createGalaxy(payload)
            .then(createdGalaxy => {
                this.setState(prevState => {
                    const image = galaxyImages[prevState.nextImageIndex % galaxyImages.length];
                    const decoratedGalaxy = {
                        ...createdGalaxy,
                        image,
                    };

                    return {
                        galaxies: [...prevState.galaxies, decoratedGalaxy],
                        showCreateModal: false,
                        newGalaxy: {
                            name: '',
                            status: 'active',
                        },
                        createError: null,
                        isCreating: false,
                        nextImageIndex: (prevState.nextImageIndex + 1) % galaxyImages.length,
                    };
                });
            })
            .catch(error => {
                console.error('Error creating galaxy:', error);
                this.setState({
                    createError: error.message || 'Unable to create galaxy. Please try again.',
                    isCreating: false,
                });
            });
    };

    getStatusBadgeClass(status) {
        if (!status) {
            return 'badge bg-secondary';
        }

        const normalizedStatus = status.toLowerCase();

        if (normalizedStatus.includes('active')) {
            return 'badge bg-success';
        }

        if (normalizedStatus.includes('inactive') || normalizedStatus.includes('disabled')) {
            return 'badge bg-secondary';
        }

        if (normalizedStatus.includes('pending') || normalizedStatus.includes('waiting')) {
            return 'badge bg-warning text-dark';
        }

        if (normalizedStatus.includes('error') || normalizedStatus.includes('failed')) {
            return 'badge bg-danger';
        }

        return 'badge bg-info';
    }

    render() {
        const {
            galaxies,
            activeGalaxyId,
            showCreateModal,
            newGalaxy,
            createError,
            isCreating,
            planetsByGalaxy,
            planetLoading,
            planetErrors,
            planetForms,
            trafficPanels,
            activeTrafficGalaxyId,
            activeTrafficPlanetId,
            planetStatusUpdating,
        } = this.state;

        return (
            <div className="full-height-container galaxies">
                <div className="text-center text-white py-5">
                    <h1>Galaxies</h1>
                    <p>These are all the galaxies listed in the database</p>
                    <div className="container">
                        <button
                            type="button"
                            className="btn btn-primary my-3"
                            onClick={this.openCreateModal}
                        >
                            Create Galaxy
                        </button>

                        <div className="accordion mt-4 text-start" id="galaxyAccordion">
                            {galaxies.length === 0 ? (
                                <div className="p-4 rounded-3 bg-white bg-opacity-10 text-white text-center">
                                    There are no galaxies yet. Create one to get started.
                                </div>
                            ) : (
                                galaxies.map(galaxy => {
                                    const isExpanded = activeGalaxyId === galaxy.id;
                                    const statusClass = this.getStatusBadgeClass(galaxy.status);
                                    const planets = planetsByGalaxy[galaxy.id] || [];
                                    const isLoadingPlanets = planetLoading[galaxy.id];
                                    const planetError = planetErrors[galaxy.id];
                                    const planetForm =
                                        planetForms[galaxy.id] || createDefaultPlanetForm();
                                    const planetFormError = planetForm.error;
                                    const isSubmittingPlanet = planetForm.isSubmitting;
                                    return (
                                        <div className="accordion-item" key={galaxy.id}>
                                            <h2 className="accordion-header">
                                                <button
                                                    type="button"
                                                    className={`accordion-button ${isExpanded ? '' : 'collapsed'}`}
                                                    onClick={() => this.toggleAccordion(galaxy.id)}
                                                    aria-expanded={isExpanded}
                                                    aria-controls={`galaxy-${galaxy.id}`}
                                                >
                                                    <div className="d-flex align-items-center gap-4 w-100 flex-column flex-sm-row">
                                                        <img
                                                            src={galaxy.image}
                                                            alt={`${galaxy.name} preview`}
                                                            className="rounded-3 border border-light-subtle object-fit-cover"
                                                        />
                                                        <div className="d-flex flex-column align-items-start gap-1 text-start">
                                                            <span className="fs-5 fw-semibold text-white">
                                                                {galaxy.name}
                                                            </span>
                                                            <span className={`${statusClass} text-capitalize`}>
                                                                {galaxy.status || 'Unknown'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </button>
                                            </h2>
                                            <div
                                                id={`galaxy-${galaxy.id}`}
                                                className={`accordion-collapse collapse ${isExpanded ? 'show' : ''}`}
                                            >
                                                <div className="accordion-body">
                                                    <div className="d-flex flex-column gap-4">
                                                        <div className="d-flex flex-wrap gap-3">
                                                            <button
                                                                type="button"
                                                                className="btn btn-outline-light"
                                                                onClick={() => this.onClickViewGalaxy(galaxy.id)}
                                                            >
                                                                View details
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn btn-outline-info"
                                                                onClick={() => this.onClickEditGalaxy(galaxy.id)}
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn btn-outline-danger"
                                                                onClick={() => this.onClickDeleteGalaxy(galaxy.id)}
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                        <div>
                                                            <h3 className="h5 text-white">Planets</h3>
                                                            {isLoadingPlanets && (
                                                                <p className="text-white-50 mb-0">Loading planets...</p>
                                                            )}
                                                            {planetError && (
                                                                <div className="alert alert-danger py-2 my-3" role="alert">
                                                                    {planetError}
                                                                </div>
                                                            )}
                                                            {!isLoadingPlanets && !planetError && (
                                                                planets.length > 0 ? (
                                                                    <>
                                                                        <div className="table-responsive">
                                                                            <table className="table table-dark table-striped align-middle">
                                                                                <thead>
                                                                                    <tr>
                                                                                        <th scope="col">ID</th>
                                                                                        <th scope="col">Name</th>
                                                                                        <th scope="col">Replicas</th>
                                                                                        <th scope="col">Delay (ms)</th>
                                                                                        <th scope="col">Status</th>
                                                                                        <th scope="col" className="text-end">Actions</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {planets.map(planet => {
                                                                                        const isSelected =
                                                                                            activeTrafficGalaxyId === galaxy.id &&
                                                                                            activeTrafficPlanetId === planet.id;
                                                                                        const isUpdatingStatus = Boolean(
                                                                                            planetStatusUpdating[planet.id]
                                                                                        );
                                                                                        return (
                                                                                            <tr
                                                                                                key={planet.id}
                                                                                                className={isSelected ? 'table-primary text-dark' : ''}
                                                                                            >
                                                                                                <td>{planet.id}</td>
                                                                                                <td>{planet.name}</td>
                                                                                                <td>{planet.replicas ?? '-'}</td>
                                                                                                <td>{planet.responseDelayMs ?? 0}</td>
                                                                                                <td className="text-capitalize">
                                                                                                    {planet.status || 'unknown'}
                                                                                                </td>
                                                                                                <td className="text-end">
                                                                                                    <div className="btn-group btn-group-sm" role="group">
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            className="btn btn-outline-light"
                                                                                                            onClick={() =>
                                                                                                                this.handleSelectPlanetForTraffic(
                                                                                                                    galaxy.id,
                                                                                                                    planet.id
                                                                                                                )
                                                                                                            }
                                                                                                        >
                                                                                                            Configure
                                                                                                        </button>
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            className="btn btn-outline-success"
                                                                                                            disabled={isUpdatingStatus}
                                                                                                            onClick={() =>
                                                                                                                this.handleUpdatePlanetStatus(
                                                                                                                    galaxy.id,
                                                                                                                    planet.id,
                                                                                                                    'open'
                                                                                                                )
                                                                                                            }
                                                                                                        >
                                                                                                            {isUpdatingStatus ? 'Saving...' : 'Open'}
                                                                                                        </button>
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            className="btn btn-outline-danger"
                                                                                                            disabled={isUpdatingStatus}
                                                                                                            onClick={() =>
                                                                                                                this.handleUpdatePlanetStatus(
                                                                                                                    galaxy.id,
                                                                                                                    planet.id,
                                                                                                                    'completed'
                                                                                                                )
                                                                                                            }
                                                                                                        >
                                                                                                            {isUpdatingStatus ? 'Saving...' : 'Complete'}
                                                                                                        </button>
                                                                                                    </div>
                                                                                                </td>
                                                                                            </tr>
                                                                                        );
                                                                                    })}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                        {activeTrafficGalaxyId === galaxy.id &&
                                                                            activeTrafficPlanetId && (
                                                                                this.renderTrafficManagerPanel(
                                                                                    galaxy.id,
                                                                                    activeTrafficPlanetId
                                                                                )
                                                                            )}
                                                                    </>
                                                                ) : (
                                                                    <p className="text-white-50 mb-0">
                                                                        No planets found for this galaxy yet.
                                                                    </p>
                                                                )
                                                            )}
                                                            <form
                                                                className="planet-form mt-4"
                                                                onSubmit={(event) => this.handleCreatePlanet(event, galaxy.id)}
                                                            >
                                                                <div className="row g-3 align-items-end">
                                                                    <div className="col-12 col-lg-4">
                                                                        <label className="form-label text-white-50">Name</label>
                                                                        <input
                                                                            type="text"
                                                                            className="form-control"
                                                                            value={planetForm.name}
                                                                            onChange={event =>
                                                                                this.handlePlanetFormChange(galaxy.id, 'name', event.target.value)
                                                                            }
                                                                            required
                                                                        />
                                                                    </div>
                                                                    <div className="col-12 col-lg-4">
                                                                        <label className="form-label text-white-50">Replicas</label>
                                                                        <input
                                                                            type="number"
                                                                            min="1"
                                                                            className="form-control"
                                                                            value={planetForm.replicas}
                                                                            onChange={event =>
                                                                                this.handlePlanetFormChange(galaxy.id, 'replicas', event.target.value)
                                                                            }
                                                                            required
                                                                        />
                                                                    </div>
                                                                    <div className="col-12 col-lg-4">
                                                                        <label className="form-label text-white-50">
                                                                            Internal Delay (ms)
                                                                        </label>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            className="form-control"
                                                                            value={planetForm.internalDelayMs}
                                                                            onChange={event =>
                                                                                this.handlePlanetFormChange(
                                                                                    galaxy.id,
                                                                                    'internalDelayMs',
                                                                                    event.target.value
                                                                                )
                                                                            }
                                                                        />
                                                                        <small className="form-text text-white-50">
                                                                            Adds latency to every worker response.
                                                                        </small>
                                                                    </div>
                                                                    {planetFormError && (
                                                                        <div className="col-12">
                                                                            <div className="alert alert-danger py-2 mb-0" role="alert">
                                                                                {planetFormError}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    <div className="col-12">
                                                                        <button
                                                                            type="submit"
                                                                            className="btn btn-primary"
                                                                            disabled={isSubmittingPlanet}
                                                                        >
                                                                            {isSubmittingPlanet ? 'Creating...' : 'Create Planet'}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </form>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {showCreateModal && (
                    <>
                        <div className="modal-backdrop fade show" />
                        <div className="modal fade show d-block" tabIndex="-1" role="dialog" aria-modal="true">
                            <div className="modal-dialog modal-dialog-centered">
                                <div className="modal-content">
                                    <div className="modal-header">
                                    <h5 className="modal-title">Create Galaxy</h5>
                                    <button
                                        type="button"
                                        className="btn-close"
                                        aria-label="Close"
                                        onClick={this.closeCreateModal}
                                    />
                                    </div>
                                    <form onSubmit={this.handleCreateGalaxy}>
                                        <div className="modal-body">
                                            <div className="mb-3 text-start">
                                                <label className="form-label">Name</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={newGalaxy.name}
                                                    onChange={event =>
                                                        this.handleNewGalaxyChange('name', event.target.value)
                                                    }
                                                    pattern="[a-z0-9]([-a-z0-9]*[a-z0-9])?"
                                                    title="Use lowercase letters, numbers, and dashes only (Kubernetes namespace format)."
                                                    required
                                                />
                                            </div>
                                            <div className="mb-3 text-start">
                                                <label className="form-label">Status</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={newGalaxy.status}
                                                    onChange={event =>
                                                        this.handleNewGalaxyChange('status', event.target.value)
                                                    }
                                                />
                                            </div>
                                            {createError && (
                                                <div className="alert alert-danger" role="alert">
                                                    {createError}
                                                </div>
                                            )}
                                        </div>
                                        <div className="modal-footer">
                                            <button
                                                type="button"
                                                className="btn btn-outline-light"
                                                onClick={this.closeCreateModal}
                                                disabled={isCreating}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                className="btn btn-primary"
                                                disabled={isCreating}
                                            >
                                                {isCreating ? 'Creating...' : 'Create Galaxy'}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    }
}
