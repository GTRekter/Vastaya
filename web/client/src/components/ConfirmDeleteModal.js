import React from 'react';

export default function ConfirmDeleteModal({
    galaxy,
    isOpen,
    isSubmitting,
    error,
    onConfirm,
    onCancel,
}) {
    if (!isOpen || !galaxy) {
        return null;
    }

    return (
        <>
            <div className="modal-backdrop fade show" />
            <div
                className="modal fade show d-block"
                tabIndex="-1"
                role="dialog"
                aria-modal="true"
            >
                <div className="modal-dialog modal-dialog-centered">
                    <div className="modal-content bg-dark text-white border border-light">
                        <div className="modal-header border-secondary">
                            <h5 className="modal-title">Delete Galaxy</h5>
                            <button
                                type="button"
                                className="btn-close btn-close-white"
                                aria-label="Close"
                                onClick={onCancel}
                                disabled={isSubmitting}
                            />
                        </div>
                        <div className="modal-body">
                            <p>
                                Are you sure you want to delete the galaxy{' '}
                                <strong>{galaxy.name}</strong>? This will remove the
                                Kubernetes namespace and every managed planet inside it.
                            </p>
                            {error && (
                                <div className="alert alert-danger py-2" role="alert">
                                    {error}
                                </div>
                            )}
                        </div>
                        <div className="modal-footer border-secondary">
                            <button
                                type="button"
                                className="btn btn-outline-light"
                                onClick={onCancel}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={onConfirm}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? 'Deleting...' : 'Delete Galaxy'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
