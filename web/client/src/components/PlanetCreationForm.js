import React from 'react';

export default function PlanetCreationForm({
    form,
    onChange,
    onSubmit,
}) {
    const handleInputChange = (field) => (event) => {
        onChange(field, event.target.value);
    };

    return (
        <form className="planet-form mt-4" onSubmit={onSubmit}>
            <div className="row g-3 align-items-end">
                <div className="col-12 col-lg-4">
                    <label className="form-label text-white-50">Name</label>
                    <input
                        type="text"
                        className="form-control"
                        value={form.name}
                        onChange={handleInputChange('name')}
                        required
                    />
                </div>
                <div className="col-12 col-lg-4">
                    <label className="form-label text-white-50">Replicas</label>
                    <input
                        type="number"
                        min="1"
                        className="form-control"
                        value={form.replicas}
                        onChange={handleInputChange('replicas')}
                        required
                    />
                </div>
                <div className="col-12 col-lg-4">
                    <label className="form-label text-white-50">Internal Delay (ms)</label>
                    <input
                        type="number"
                        min="0"
                        className="form-control"
                        value={form.internalDelayMs}
                        onChange={handleInputChange('internalDelayMs')}
                    />
                    <small className="form-text text-white-50">
                        Adds latency to every worker response.
                    </small>
                </div>
                {form.error && (
                    <div className="col-12">
                        <div className="alert alert-danger py-2 mb-0" role="alert">
                            {form.error}
                        </div>
                    </div>
                )}
                <div className="col-12">
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={form.isSubmitting}
                    >
                        {form.isSubmitting ? 'Creating...' : 'Create Planet'}
                    </button>
                </div>
            </div>
        </form>
    );
}
