import React from 'react';

function computeProtocolFlags(protocol) {
    const normalized = (protocol || 'http').toLowerCase();
    return {
        normalized,
        isHttp: normalized === 'http' || normalized === 'http2',
        isHttp2: normalized === 'http2',
    };
}

export default function TrafficManagerPanel({
    galaxyId,
    planet,
    panel,
    onChange,
    onStart,
    onStop,
    onRefresh,
}) {
    if (!planet) {
        return null;
    }

    const config = panel?.config || {};
    const status = panel?.status || null;
    const error = panel?.error || null;
    const isSubmitting = Boolean(panel?.isSubmitting);
    const isStatusLoading = Boolean(panel?.isStatusLoading);
    const { normalized, isHttp, isHttp2 } = computeProtocolFlags(config.protocol);
    const isRunning = Boolean(status?.active);

    const handleFieldChange = (field) => (event) => {
        const value =
            event?.target?.type === 'checkbox'
                ? event.target.checked
                : event?.target?.value;
        onChange(field, value);
    };

    const handleRefresh = () => onRefresh();
    const handleStart = () => onStart();
    const handleStop = () => onStop();

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
                            disabled={isSubmitting}
                            onClick={handleRefresh}
                        >
                            {isStatusLoading ? 'Refreshing...' : 'Refresh Status'}
                        </button>
                        <button
                            type="button"
                            className="btn btn-success"
                            disabled={isSubmitting}
                            onClick={handleStart}
                        >
                            {isSubmitting ? 'Starting...' : 'Start Traffic'}
                        </button>
                        <button
                            type="button"
                            className="btn btn-warning"
                            disabled={isSubmitting || !isRunning}
                            onClick={handleStop}
                        >
                            {isSubmitting ? 'Stopping...' : 'Stop Traffic'}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="alert alert-danger py-2" role="alert">
                        {error}
                    </div>
                )}

                <div className="row g-3">
                    <div className="col-12 col-md-4">
                        <label className="form-label text-white-50">Protocol</label>
                        <select
                            className="form-select"
                            value={config.protocol || 'http'}
                            onChange={handleFieldChange('protocol')}
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
                            value={config.target || ''}
                            onChange={handleFieldChange('target')}
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
                            value={config.requestsPerSecond || ''}
                            onChange={handleFieldChange('requestsPerSecond')}
                            required
                        />
                    </div>
                    {isHttp && (
                        <div className="col-12 col-md-4">
                            <label className="form-label text-white-50">HTTP Method</label>
                            <select
                                className="form-select"
                                value={config.method || 'POST'}
                                onChange={handleFieldChange('method')}
                            >
                                <option value="POST">POST</option>
                                <option value="GET">GET</option>
                                <option value="PUT">PUT</option>
                                <option value="PATCH">PATCH</option>
                                <option value="DELETE">DELETE</option>
                            </select>
                        </div>
                    )}
                    <div className={`col-12 col-md-${isHttp ? '4' : '6'}`}>
                        <label className="form-label text-white-50">Request Timeout (ms)</label>
                        <input
                            type="number"
                            min="1000"
                            step="500"
                            className="form-control"
                            value={config.requestTimeoutMs || ''}
                            onChange={handleFieldChange('requestTimeoutMs')}
                        />
                    </div>
                    <div className="col-12">
                        <label className="form-label text-white-50">Payload (optional)</label>
                        <textarea
                            className="form-control"
                            rows="3"
                            value={config.payload || ''}
                            onChange={handleFieldChange('payload')}
                        />
                    </div>
                    <div className="col-12">
                        <label className="form-label text-white-50">
                            Headers JSON (optional)
                        </label>
                        <textarea
                            className="form-control"
                            rows="3"
                            value={config.headersJson || ''}
                            placeholder='{"X-Example": "value"}'
                            onChange={handleFieldChange('headersJson')}
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
                                    id={`allowInsecure-${planet.id}`}
                                    checked={Boolean(config.allowInsecureHttp2)}
                                    onChange={handleFieldChange('allowInsecureHttp2')}
                                />
                                <label
                                    className="form-check-label text-white-50"
                                    htmlFor={`allowInsecure-${planet.id}`}
                                >
                                    Allow insecure HTTP/2 (skip TLS validation)
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-4">
                    <h5 className="h6 text-white-50 text-uppercase">Latest Status</h5>
                    {isStatusLoading ? (
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
}
