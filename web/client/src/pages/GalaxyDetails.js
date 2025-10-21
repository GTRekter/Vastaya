import React, { Component } from 'react';
import './galaxyDetails.css';
import PlanetsService from '../services/PlanetsService';
import GalaxiesService from '../services/GalaxiesService';
import CommentsService from '../services/CommentsService';

export default class GalaxyDetails extends Component {
    state = {
        name: '',
        status: '',
        planets: [],
        comments: []
    };

    componentDidMount() {
        const { galaxyId } = this.props.match.params;
        console.log("Fetching galaxy details for galaxy ID:", galaxyId);
        GalaxiesService.getGalaxyById(galaxyId)
            .then(galaxy => this.setState({ name: galaxy.name, status: galaxy.status }))
            .catch(error => console.error('Error fetching galaxy:', error));
        console.log("Fetching planets for galaxy ID:", galaxyId);
        console.log("API URL:", process.env.REACT_APP_PLANETS_API_URL);
        PlanetsService.getPlanetsByGalaxyId(galaxyId)
            .then(planets => this.setState({ planets }))
            .catch(error => console.error('Error fetching planets:', error));
    }

    onClickOpenPlanet = (planetId) => {
        PlanetsService.updatePlanetStatus(planetId, { status: "open" })
            .then(() => {
                const planets = this.state.planets.map(planet => {
                    if (planet.id === planetId) {
                        planet.status = "open";
                    }
                    return planet;
                });
                this.setState({ planets });
                const { galaxyId } = this.props.match.params;
                GalaxiesService.getGalaxyById(galaxyId)
                    .then(galaxy => this.setState({ status: galaxy.status }))
                    .catch(error => console.error('Error fetching galaxy:', error));
            })
            .catch(error => console.error('Error updating planet:', error));
    };

    onClickCompletePlanet = (planetId) => {
        PlanetsService.updatePlanetStatus(planetId, { status: "completed" })
            .then(() => {
                const planets = this.state.planets.map(planet => {
                    if (planet.id === planetId) {
                        planet.status = "completed";
                    }
                    return planet;
                });
                this.setState({ planets });
                const { galaxyId } = this.props.match.params;
                GalaxiesService.getGalaxyById(galaxyId)
                    .then(galaxy => this.setState({ status: galaxy.status }))
                    .catch(error => console.error('Error fetching galaxy:', error));
            })
            .catch(error => console.error('Error updating planet:', error));
    };

    onClickLoadComments = (planetId) => {
        if (!this.state.comments || this.state.comments.length === 0) {
            CommentsService.getCommentsByPlanetId(planetId)
                .then(comments => this.setState({ comments }))
                .catch(error => console.error('Error fetching comments:', error));
        } else {
            this.setState({ comments: [] });
        }
    };

    render() {
        return (
            <div className="full-height-container">
                <div className="text-center text-white py-5">   
                    <h1>{this.state.name}</h1>
                    <p>Status: {this.state.status}</p>
                </div>
                <div className="text-center text-white py-5">  
                    <h2>Planets</h2>
                    <p>These are all the planets charted within this galaxy</p>
                    <div className="container">
                        <table className="table table-dark table-striped">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Description</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody className="accordion accordion-flush" id="accordionComments">
                                {this.state.planets.map((planet) => (
                                    <React.Fragment key={planet.id}>
                                    <tr id={`accordionComments${planet.id}`} className="accordion-item" onClick={() => this.onClickLoadComments(planet.id)}>
                                        <td data-bs-toggle="collapse" data-bs-target={`#collapse-${planet.id}`} aria-expanded="false" aria-controls={`collapse-${planet.id}`}>{planet.id}</td>
                                        <td data-bs-toggle="collapse" data-bs-target={`#collapse-${planet.id}`} aria-expanded="false" aria-controls={`collapse-${planet.id}`}>{planet.name}</td>
                                        <td data-bs-toggle="collapse" data-bs-target={`#collapse-${planet.id}`} aria-expanded="false" aria-controls={`collapse-${planet.id}`}>{planet.description}</td>
                                        <td data-bs-toggle="collapse" data-bs-target={`#collapse-${planet.id}`} aria-expanded="false" aria-controls={`collapse-${planet.id}`}>{planet.status}</td>
                                        <td>
                                            <button className="btn btn-primary" onClick={() => this.onClickCompletePlanet(planet.id)}>Mark Completed</button>
                                            <button className="btn btn-danger" onClick={() => this.onClickOpenPlanet(planet.id)}>Mark Open</button>
                                        </td>
                                    </tr>
                                    <tr id={`collapse-${planet.id}`} className="accordion-collapse collapse" aria-labelledby={`accordionComments${planet.id}`} data-bs-parent="#accordionComments">
                                        <td colSpan="5">
                                            {this.state.comments ? (
                                                this.state.comments.map((comment) => (
                                                <div key={comment.id}>
                                                    <p><strong>{comment.author}</strong>: {comment.content}</p>
                                                </div>
                                                ))
                                            ) : (
                                                <p>Loading comments...</p>
                                            )}
                                        </td>
                                    </tr>
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }
}
