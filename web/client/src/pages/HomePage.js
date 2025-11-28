import React from 'react';
import { Link } from 'react-router-dom';
import linkyImage from '../images/linky.png';
import './homePage.css';

const FEATURE_CARDS = [
    {
        label: '🪐 Universe Builder',
        description: 'Spawn planets, wire up Linkerd policies, and toggle wormholes, nebulae, and chaos.',
        actionLabel: 'Configure planets',
        to: '/universe',
        accent: 'build',
    },
    {
        label: '🚀 Fleet Command',
        description: 'Drive load generators, RPS, and resiliency demos to watch Linkerd keep traffic stable.',
        actionLabel: 'Launch traffic',
        to: '/fleet',
        accent: 'fleet',
    },
    {
        label: '💬 VastayaGPT',
        description: 'Ask our copilots for scripts, manifest snippets, or help narrating your service-mesh storyline.',
        actionLabel: 'Open chat',
        to: '/gpt',
        accent: 'gpt',
    },
];

const STEPS = [
    'Sketch your galaxy layout with Trade Hubs, Archive Worlds, labs, or Resorts.',
    'Layer in Linkerd features—traffic splits, mTLS, retries, circuit breaking.',
    'Flip to Fleet Command to bombard the mesh with steady, bursty, or chaotic load.',
    'Narrate everything live with VastayaGPT or stream it into dashboards.',
];

const STATS = [
    { label: 'Planets configured every demo', value: '10x', sub: 'service permutations' },
    { label: 'Traffic-split experiments', value: '90/10', sub: 'wormhole defaults' },
    { label: 'Setup-to-demo time', value: '5 min', sub: 'from zero to wow' },
];

const HomePage = () => {
    return (
        <div className="full-height-container text-white">    
            <div className="container">

                <section className="row align-items-center">
                    <div className="col-12 col-lg-6 offset-lg-1">
                        <p className="eyebrow text-uppercase mb-2">Galactic Shipping Lane Simulator</p>
                        <h1>Manage your galaxy with Linkerd</h1>
                        <p className="lead text-white">
                            Each planet is a service, every ship a request. Shape the topology, dial up chaos, then prove how Linkerd keeps the lanes encrypted, observable, and resilient.
                        </p>
                        <div className="row mt-4">
                            <div className="col-auto">
                                <Link to="/universe" className="btn btn-primary btn-lg">
                                    Build your universe
                                </Link>
                            </div>
                            <div className="col-auto">
                                <Link to="/fleet" className="btn btn-outline-light btn-lg">
                                    Launch the fleet
                                </Link>
                            </div>
                        </div>
                    </div>
                    <div className="col-12 col-lg-5">
                        <div className="linkerd-card">
                            <img src={linkyImage} alt="Linky mascot" className="icon" />
                            <ul className="callouts">
                                <li>Nebula interference sliders</li>
                                <li>mTLS shields everywhere</li>
                                <li>Chaos generators for unpredictability</li>
                            </ul>
                        </div>
                    </div>
                </section>

                <section className="row statistics">
                    {STATS.map((stat) => (
                        <div className="col-12 col-lg-4 my-4" key={stat.label}>
                            <div className="card p-4 text-center">
                                <p className="fs-1 fw-bold mb-1">{stat.value}</p>
                                <p className="text-uppercase text-white-50 small mb-1">{stat.label}</p>
                                <p className="text-white-50 mb-0">{stat.sub}</p>
                            </div>
                        </div>
                    ))}
                </section>

                <section className="row features">
                    {FEATURE_CARDS.map((feature) => (
                        <div className="col-12 col-lg-4 my-4" key={feature.label}>
                            <div className="card p-4 text-center">
                                <p className="h5 fw-semibold mb-2">{feature.label}</p>
                                <p className="text-white-50 mb-3">{feature.description}</p>
                                <Link className="stretched-link text-decoration-none" to={feature.to}>
                                    {feature.actionLabel} →
                                </Link>
                            </div>
                        </div>
                    ))}
                </section>

                <section className="row steps">
                    <div className="col-12">
                        <div className="card">
                            <p className="eyebrow mb-2">How it works</p>
                            <h2>From blank cluster to cinematic demo in minutes</h2>
                            <ol>
                                {STEPS.map((step, idx) => (
                                    <li key={step}>
                                        <span className="index">{idx + 1}</span>
                                        <p>{step}</p>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    </div>
                </section>

            </div>
        </div>
    );
};

export default HomePage;