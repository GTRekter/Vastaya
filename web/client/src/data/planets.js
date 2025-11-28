import planetImg1 from '../images/planets/1.png';
import planetImg2 from '../images/planets/2.png';
import planetImg3 from '../images/planets/3.png';
import planetImg4 from '../images/planets/4.png';

export const PLANET_TYPES = [
    { value: 'trade', label: '🛒 Trade Hub', description: 'High-throughput, stateless service' },
    { value: 'archive', label: '📚 Archive World', description: 'Slow, high-latency storage nodes' },
    { value: 'research', label: '🧪 Experimental Research', description: 'Flaky service that injects failures' },
    { value: 'resort', label: '🏝 Resort Planet', description: 'Low traffic most days with dramatic spikes' },
];

export const PLANET_IMAGES = [planetImg1, planetImg2, planetImg3, planetImg4];

export const PLANET_ROSTER = PLANET_TYPES.map((type, idx) => {
    const code = String.fromCharCode(65 + idx);
    return {
        id: `planet-${String.fromCharCode(97 + idx)}`,
        code,
        displayName: `Planet ${code}`,
        type: type.value,
        typeLabel: type.label,
        description: type.description,
        image: PLANET_IMAGES[idx % PLANET_IMAGES.length],
    };
});
