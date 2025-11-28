export const WARP_SPEED_OPTIONS = [
    { value: 'cruise', label: 'Cruise speed (steady)', description: 'Constant RPS for predictable dashboards.' },
    { value: 'warp', label: 'Warp jumps (bursty)', description: 'Short spikes to show Linkerd retries.' },
    { value: 'chaotic', label: 'Chaotic hyperspace (spiky)', description: 'Random bursts to stress circuit breaking.' },
];

export function getWarpSpeedMeta(speed) {
    return WARP_SPEED_OPTIONS.find((option) => option.value === speed) || null;
}
