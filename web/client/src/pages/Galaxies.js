import React, { Component } from 'react';
import GalaxiesService from '../services/GalaxiesService';
import PlanetsService from '../services/PlanetsService';
import './galaxies.css';
import PlanetCreationForm from '../components/PlanetCreationForm';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import ConfirmDeletePlanetModal from '../components/ConfirmDeletePlanetModal';
import TrafficManagerPanel from '../components/TrafficManagerPanel';

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
        galaxyDeletion: {},
        planetDeletion: {},
        planetDeleteModal: {
            galaxyId: null,
            planetId: null,
            error: null,
        },
        isDeleteModalOpen: false,
        deleteModalGalaxyId: null,
        deleteModalError: null,
    };

    constructor(props) {
        super(props);
        this.onClickViewGalaxy = this.onClickViewGalaxy.bind(this);
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

    onClickDeleteGalaxy(galaxyId) {
        if (!galaxyId) {
            return;
        }

        this.setState({
            isDeleteModalOpen: true,
            deleteModalGalaxyId: galaxyId,
            deleteModalError: null,
        });
    }

    closeDeleteModal = () => {
        const { deleteModalGalaxyId, galaxyDeletion } = this.state;
        if (deleteModalGalaxyId && galaxyDeletion[deleteModalGalaxyId]) {
            return;
        }

        this.setState({
            isDeleteModalOpen: false,
            deleteModalGalaxyId: null,
            deleteModalError: null,
        });
    };

    confirmDeleteGalaxy = () => {
        const { deleteModalGalaxyId } = this.state;
        if (!deleteModalGalaxyId) {
            return;
        }

        const galaxyId = deleteModalGalaxyId;

        this.setState(prevState => ({
            galaxyDeletion: {
                ...prevState.galaxyDeletion,
                [galaxyId]: true,
            },
            deleteModalError: null,
        }));

        GalaxiesService.deleteGalaxy(galaxyId)
            .then(() => {
                this.setState(prevState => {
                    const nextDeletion = { ...prevState.galaxyDeletion };
                    delete nextDeletion[galaxyId];

                    const nextGalaxies = prevState.galaxies.filter(
                        (galaxy) => galaxy.id !== galaxyId
                    );

                    const removedPlanets = prevState.planetsByGalaxy[galaxyId] || [];
                    const { [galaxyId]: _planets, ...remainingPlanets } =
                        prevState.planetsByGalaxy;
                    const { [galaxyId]: _forms, ...remainingForms } =
                        prevState.planetForms;
                    const { [galaxyId]: _loading, ...remainingLoading } =
                        prevState.planetLoading;
                    const { [galaxyId]: _errors, ...remainingErrors } =
                        prevState.planetErrors;

                    const nextTrafficPanels = { ...prevState.trafficPanels };
                    const nextPlanetDeletion = { ...prevState.planetDeletion };
                    removedPlanets.forEach((planet) => {
                        if (planet?.id) {
                            delete nextTrafficPanels[planet.id];
                            delete nextPlanetDeletion[planet.id];
                        }
                    });

                    let activeGalaxyId = prevState.activeGalaxyId;
                    if (activeGalaxyId === galaxyId) {
                        activeGalaxyId = null;
                    }

                    let activeTrafficGalaxyId = prevState.activeTrafficGalaxyId;
                    let activeTrafficPlanetId = prevState.activeTrafficPlanetId;
                    if (activeTrafficGalaxyId === galaxyId) {
                        activeTrafficGalaxyId = null;
                        activeTrafficPlanetId = null;
                    }

                    return {
                        galaxies: nextGalaxies,
                        galaxyDeletion: nextDeletion,
                        planetsByGalaxy: remainingPlanets,
                        planetForms: remainingForms,
                        planetLoading: remainingLoading,
                        planetErrors: remainingErrors,
                        planetDeletion: nextPlanetDeletion,
                        trafficPanels: nextTrafficPanels,
                        activeGalaxyId,
                        activeTrafficGalaxyId,
                        activeTrafficPlanetId,
                        isDeleteModalOpen: false,
                        deleteModalGalaxyId: null,
                        deleteModalError: null,
                    };
                });
            })
            .catch((error) => {
                console.error('Failed to delete galaxy:', error);
                this.setState(prevState => {
                    const nextDeletion = { ...prevState.galaxyDeletion };
                    delete nextDeletion[galaxyId];
                    return {
                        galaxyDeletion: nextDeletion,
                        deleteModalError:
                            (error && error.message) ||
                            'Failed to delete galaxy. Please try again.',
                    };
                });
            });
    };

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

        if (
            this.state.activeTrafficGalaxyId === galaxyId &&
            this.state.activeTrafficPlanetId === planetId
        ) {
            this.setState({
                activeTrafficGalaxyId: null,
                activeTrafficPlanetId: null,
            });
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

    handleDeletePlanet = (galaxyId, planetId) => {
        if (!galaxyId || !planetId) {
            return;
        }

        const planet = this.getPlanetFromState(galaxyId, planetId);
        if (!planet) {
            return;
        }

        this.setState({
            planetDeleteModal: {
                galaxyId,
                planetId,
                error: null,
            },
        });
    };

    confirmDeletePlanet = () => {
        const { planetDeleteModal } = this.state;
        const galaxyId = planetDeleteModal.galaxyId;
        const planetId = planetDeleteModal.planetId;

        if (!galaxyId || !planetId) {
            return;
        }

        this.setState(prevState => ({
            planetDeletion: {
                ...prevState.planetDeletion,
                [planetId]: true,
            },
            planetErrors: {
                ...prevState.planetErrors,
                [galaxyId]: null,
            },
            planetDeleteModal: {
                ...prevState.planetDeleteModal,
                error: null,
            },
        }));

        PlanetsService.deletePlanet(galaxyId, planetId)
            .then(() => {
                this.setState(prevState => {
                    const nextDeletion = { ...prevState.planetDeletion };
                    delete nextDeletion[planetId];

                    const existingPlanets = prevState.planetsByGalaxy[galaxyId] || [];
                    const filteredPlanets = existingPlanets.filter(
                        (planet) => planet.id !== planetId
                    );

                    const nextPlanetsByGalaxy = {
                        ...prevState.planetsByGalaxy,
                        [galaxyId]: filteredPlanets,
                    };

                    const nextForms = { ...prevState.planetForms };
                    if (nextForms[galaxyId]) {
                        nextForms[galaxyId] = {
                            ...nextForms[galaxyId],
                            error: null,
                            isSubmitting: false,
                        };
                    }

                    const nextTrafficPanels = { ...prevState.trafficPanels };
                    delete nextTrafficPanels[planetId];

                    let { activeTrafficGalaxyId, activeTrafficPlanetId } = prevState;
                    if (
                        activeTrafficGalaxyId === galaxyId &&
                        activeTrafficPlanetId === planetId
                    ) {
                        activeTrafficGalaxyId = null;
                        activeTrafficPlanetId = null;
                    }

                    return {
                        planetDeletion: nextDeletion,
                        planetsByGalaxy: nextPlanetsByGalaxy,
                        planetForms: nextForms,
                        trafficPanels: nextTrafficPanels,
                        activeTrafficGalaxyId,
                        activeTrafficPlanetId,
                        planetDeleteModal: {
                            galaxyId: null,
                            planetId: null,
                            error: null,
                        },
                    };
                });
            })
            .catch(error => {
                console.error('Failed to delete planet:', error);
                this.setState(prevState => {
                    const nextDeletion = { ...prevState.planetDeletion };
                    delete nextDeletion[planetId];
                    return {
                        planetDeletion: nextDeletion,
                        planetErrors: {
                            ...prevState.planetErrors,
                            [galaxyId]:
                                (error && error.message) ||
                                'Failed to delete planet. Please try again.',
                        },
                        planetDeleteModal: {
                            galaxyId,
                            planetId,
                            error:
                                (error && error.message) ||
                                'Failed to delete planet. Please try again.',
                        },
                    };
                });
            });
    };

    closeDeletePlanetModal = () => {
        const { planetDeleteModal, planetDeletion } = this.state;
        const { planetId } = planetDeleteModal;

        if (planetId && planetDeletion[planetId]) {
            return;
        }

        this.setState({
            planetDeleteModal: {
                galaxyId: null,
                planetId: null,
                error: null,
            },
        });
    };

    renderTrafficManagerPanel = (galaxyId, planetId) => {
        const planet = this.getPlanetFromState(galaxyId, planetId);
        if (!planet) {
            return null;
        }

        const panel =
            this.state.trafficPanels[planetId] || createDefaultTrafficPanelState();
        return (
            <TrafficManagerPanel
                galaxyId={galaxyId}
                planet={planet}
                panel={panel}
                onChange={(field, value) =>
                    this.handleTrafficConfigChange(planetId, field, value)
                }
                onStart={() => this.handleStartTraffic(galaxyId, planetId)}
                onStop={() => this.handleStopTraffic(galaxyId, planetId)}
                onRefresh={() => this.refreshTrafficStatus(galaxyId, planetId)}
            />
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
            galaxyDeletion,
            planetDeletion,
            isDeleteModalOpen,
            deleteModalGalaxyId,
            deleteModalError,
            planetDeleteModal,
        } = this.state;

        const selectedDeleteGalaxy = galaxies.find(
            (galaxy) => galaxy.id === deleteModalGalaxyId
        ) || null;

        const isPlanetDeleteModalOpen =
            Boolean(planetDeleteModal.galaxyId) &&
            Boolean(planetDeleteModal.planetId);
        const planetForDeleteModal = isPlanetDeleteModalOpen
            ? this.getPlanetFromState(
                  planetDeleteModal.galaxyId,
                  planetDeleteModal.planetId
              ) || {
                  id: planetDeleteModal.planetId || '',
                  name: planetDeleteModal.planetId || '',
                  serviceName: '',
                  spaceportStatus: '',
              }
            : null;

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
                                    const isDeletingGalaxy = Boolean(galaxyDeletion[galaxy.id]);
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
                                                                className="btn btn-outline-danger"
                                                                disabled={isDeletingGalaxy}
                                                                onClick={() => this.onClickDeleteGalaxy(galaxy.id)}
                                                            >
                                                                {isDeletingGalaxy ? 'Deleting...' : 'Delete'}
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
                                                                                        <th scope="col">Spaceport</th>
                                                                                        <th scope="col">Status</th>
                                                                                        <th scope="col" className="text-end">Actions</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {planets.map(planet => {
                                                                                        const isSelected =
                                                                                            activeTrafficGalaxyId === galaxy.id &&
                                                                                            activeTrafficPlanetId === planet.id;
                                                                                        const isDeletingPlanet = Boolean(
                                                                                            planetDeletion[planet.id]
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
                                                                                                <td>
                                                                                                    <span className="text-capitalize">
                                                                                                        {planet.spaceportStatus || 'unknown'}
                                                                                                    </span>
                                                                                                    <small className="d-block text-white-50">
                                                                                                        {planet.serviceName
                                                                                                            ? `${planet.serviceName}.${galaxy.id}.svc`
                                                                                                            : 'No service'}
                                                                                                    </small>
                                                                                                </td>
                                                                                                <td className="text-capitalize">
                                                                                                    {planet.status || 'unknown'}
                                                                                                </td>
                                                                                                <td className="text-end">
                                                                                                    <div className="btn-group btn-group-sm" role="group">
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            className={`btn btn-outline-light ${isSelected ? 'active' : ''}`}
                                                                                                            disabled={
                                                                                                                isDeletingGalaxy ||
                                                isDeletingPlanet ||
                                                (isPlanetDeleteModalOpen &&
                                                    planetDeleteModal.planetId === planet.id)
                                            }
                                                                                                            onClick={() =>
                                                                                                                this.handleSelectPlanetForTraffic(
                                                                                                                    galaxy.id,
                                                                                                                    planet.id
                                                                                                                )
                                                                                                            }
                                                                                                        >
                                                                                                            {isSelected ? 'Hide' : 'Configure'}
                                                                                                        </button>
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            className="btn btn-outline-danger"
                                                                                                            disabled={
                                                isDeletingGalaxy ||
                                                isDeletingPlanet ||
                                                (isPlanetDeleteModalOpen &&
                                                    planetDeleteModal.planetId === planet.id)
                                            }
                                                                                                            onClick={() =>
                                                                                                                this.handleDeletePlanet(
                                                                                                                    galaxy.id,
                                                                                                                    planet.id
                                                                                                                )
                                                                                                            }
                                                                                                        >
                                                                                                            {isDeletingPlanet ? 'Deleting...' : 'Delete'}
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
                                                            <PlanetCreationForm
                                                                form={planetForm}
                                                                onChange={(field, value) =>
                                                                    this.handlePlanetFormChange(galaxy.id, field, value)
                                                                }
                                                                onSubmit={(event) =>
                                                                    this.handleCreatePlanet(event, galaxy.id)
                                                                }
                                                            />
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

                <ConfirmDeletePlanetModal
                    planet={planetForDeleteModal}
                    galaxyId={planetDeleteModal.galaxyId}
                    isOpen={isPlanetDeleteModalOpen}
                    isSubmitting={Boolean(
                        planetDeleteModal.planetId &&
                        planetDeletion[planetDeleteModal.planetId]
                    )}
                    error={planetDeleteModal.error}
                    onConfirm={this.confirmDeletePlanet}
                    onCancel={this.closeDeletePlanetModal}
                />

                <ConfirmDeleteModal
                    galaxy={selectedDeleteGalaxy}
                    isOpen={isDeleteModalOpen}
                    isSubmitting={Boolean(
                        deleteModalGalaxyId && galaxyDeletion[deleteModalGalaxyId]
                    )}
                    error={deleteModalError}
                    onConfirm={this.confirmDeleteGalaxy}
                    onCancel={this.closeDeleteModal}
                />

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
