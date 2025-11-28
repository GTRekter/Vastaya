const API_BASE = process.env.REACT_APP_UNIVERSE_API_BASE_URL || '/api/universe';

async function request(path = '', options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        ...options,
    });

    const text = await response.text();
    let data = null;

    if (text) {
        try {
            data = JSON.parse(text);
        } catch (error) {
            data = text;
        }
    }

    if (!response.ok) {
        const message =
            (data && typeof data === 'object' && (data.error || data.message)) ||
            text ||
            `Request failed with status ${response.status}`;
        throw new Error(message);
    }

    return data;
}

export async function fetchUniverseConfig(options = {}) {
    return request('', {
        method: 'GET',
        signal: options.signal,
    });
}

export async function saveUniverseConfig(config, options = {}) {
    return request('', {
        method: 'PUT',
        body: JSON.stringify(config),
        signal: options.signal,
    });
}

export async function applyUniverseConfig(options = {}) {
    return request('/apply', {
        method: 'POST',
        signal: options.signal,
    });
}
