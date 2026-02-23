const API_BASE = process.env.REACT_APP_FLEET_API_BASE_URL || '/api/fleet';

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
        } catch {
            data = text;
        }
    }

    if (!response.ok) {
        const message =
            (data && typeof data === 'object' && (data.error || data.message || data.detail)) ||
            text ||
            `Request failed with status ${response.status}`;
        throw new Error(message);
    }

    return data;
}

export async function fetchMissions(options = {}) {
    return request('/missions', {
        method: 'GET',
        signal: options.signal,
    });
}

export async function createMission(mission, options = {}) {
    return request('/missions', {
        method: 'POST',
        body: JSON.stringify(mission),
        signal: options.signal,
    });
}

export async function terminateMission(missionId, options = {}) {
    return request(`/missions/${missionId}`, {
        method: 'DELETE',
        signal: options.signal,
    });
}

export async function fetchMissionLogs(missionId, options = {}) {
    return request(`/missions/${missionId}/logs`, {
        method: 'GET',
        signal: options.signal,
    });
}
