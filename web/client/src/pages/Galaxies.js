import React, { Component } from 'react';
import GalaxiesService from '../services/GalaxiesService';
import './galaxies.css';

import galaxyImage1 from '../images/galaxies/1.jpeg';
import galaxyImage2 from '../images/galaxies/2.jpeg';
import galaxyImage3 from '../images/galaxies/3.jpeg';
import galaxyImage4 from '../images/galaxies/4.jpeg';

const galaxyImages = [galaxyImage1, galaxyImage2, galaxyImage3, galaxyImage4];
const KUBERNETES_NAMESPACE_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

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
        this.setState(prevState => ({
            activeGalaxyId: prevState.activeGalaxyId === galaxyId ? null : galaxyId,
        }));
    };

    openCreateModal = () => {
        this.setState({
            showCreateModal: true,
            createError: null,
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
