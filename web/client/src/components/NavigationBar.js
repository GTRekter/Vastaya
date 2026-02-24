import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './navigationBar.css';

const NAV_LINKS = [
    { label: 'Home', to: '/' },
    { label: 'Universe Builder', to: '/universe' },
    { label: 'Fleet Command', to: '/fleet' },
    { label: 'Visual Universe', to: '/visual-universe' },
    { label: 'VastayaGPT', to: '/gpt' },
];

const NavigationBar = () => {
    const location = useLocation();
    const [isOpen, setIsOpen] = useState(false);

    const toggleMenu = () => setIsOpen((prev) => !prev);

    useEffect(() => {
        setIsOpen(false);
    }, [location.pathname]);

    return (
        <header className="site-navigation">
            <div className="container-fluid nav-inner">
                <Link className="brand-link" to="/">
                    <div className="brand-icon">🚢</div>
                    <div>
                        <p className="brand-title mb-0">Vastaya</p>
                        <p className="brand-subtitle mb-0">Galactic Simulator</p>
                    </div>
                </Link>

                <button
                    className="nav-toggle d-lg-none"
                    type="button"
                    aria-label="Toggle navigation"
                    aria-expanded={isOpen}
                    onClick={toggleMenu}
                >
                    <span />
                    <span />
                    <span />
                </button>

                <nav className={`nav-links ${isOpen ? 'open' : ''}`}>
                    {NAV_LINKS.map((link) => {
                        const isActive = location.pathname === link.to;
                        return (
                            <Link key={link.to} className={`nav-link-pill ${isActive ? 'active' : ''}`} to={link.to}>
                                {link.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="nav-cta d-none d-lg-flex">
                    <Link to="/fleet" className="btn btn-primary btn-sm me-2">
                        Launch Fleet
                    </Link>
                    <Link to="/universe" className="btn btn-outline-light btn-sm">
                        Build Universe
                    </Link>
                </div>
            </div>
        </header>
    );
};

export default NavigationBar;
