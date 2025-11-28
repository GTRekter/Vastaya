const REACT_APP_CONTROL_TOWER_URL =
    process.env.REACT_APP_CONTROL_TOWER_URL || 'http://localhost:3100/chat';

export async function sendChatRequest({ message, provider, sessionId }) {
    const trimmed = (message || '').trim();
    if (!trimmed) {
        throw new Error('A message is required.');
    }
    const payload = {
        message: trimmed,
        provider: provider || 'google',
        session_id: sessionId || undefined
    };

    const response = await fetch(REACT_APP_CONTROL_TOWER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Control Tower error (${response.status})`);
    }
    const data = await response.json();
    return data?.content || '';
}
