import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
    Background,
    BaseEdge,
    Controls,
    EdgeLabelRenderer,
    Handle,
    MarkerType,
    Position,
    useEdgesState,
    useNodesState,
    useStore,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { PLANET_ROSTER } from '../data/planets';
import { fetchMissions } from '../services/fleetApi';
import { fetchUniverseConfig } from '../services/universeApi';
import shipImg1 from '../images/ships/1.png';
import shipImg2 from '../images/ships/2.png';
import shipImg3 from '../images/ships/3.png';
import './universeMap.css';

const POLL_INTERVAL = 5000;

const PLANET_POSITIONS = {
    'planet-a': { x: 280, y: 20 },
    'planet-b': { x: 520, y: 230 },
    'planet-c': { x: 280, y: 440 },
    'planet-d': { x: 40, y: 230 },
};

const EDGE_COLOR_NORMAL = '#9cb3ff';
const EDGE_COLOR_ERROR  = '#ff6b6b';

// 'chaotic' speed actively injects failures — treat it as the error signal.
const edgeColor = (mission) =>
    mission.speed === 'chaotic' ? EDGE_COLOR_ERROR : EDGE_COLOR_NORMAL;

const SHIP_ICONS = {
    cruise: shipImg1,
    warp: shipImg2,
    chaotic: shipImg3,
};

const PLANET_VISUALS = PLANET_ROSTER.reduce((acc, planet) => {
    acc[planet.id] = {
        image: planet.image,
        typeLabel: planet.typeLabel,
        displayName: planet.displayName,
        description: planet.description,
    };
    return acc;
}, {});

// ── Floating-edge helpers ────────────────────────────────────────────────────

function nodeCenter(node) {
    const pos = node.positionAbsolute ?? node.position;
    return {
        x: pos.x + (node.width ?? 130) / 2,
        y: pos.y + (node.height ?? 130) / 2,
    };
}

// Intersection of the line (nodeCenter → targetCenter) with the node's bounding box
function getNodeIntersection(node, targetCenter) {
    const center = nodeCenter(node);
    const w = (node.width ?? 130) / 2;
    const h = (node.height ?? 130) / 2;
    const dx = targetCenter.x - center.x;
    const dy = targetCenter.y - center.y;

    if (dx === 0 && dy === 0) return center;

    if (Math.abs(dy) * w <= Math.abs(dx) * h) {
        // Left or right face
        const x = dx > 0 ? center.x + w : center.x - w;
        const y = center.y + dy * (w / Math.abs(dx));
        return { x, y };
    }
    // Top or bottom face
    const y = dy > 0 ? center.y + h : center.y - h;
    const x = center.x + dx * (h / Math.abs(dy));
    return { x, y };
}

// ── Custom edge: exits/enters from the nearest face, curves away from parallel edges ──

const EDGE_SPACING = 32; // px of perpendicular separation per parallel edge

const FloatingEdge = ({ id, source, target, style, markerEnd, data }) => {
    const sourceNode = useStore(useCallback((s) => s.nodeInternals.get(source), [source]));
    const targetNode = useStore(useCallback((s) => s.nodeInternals.get(target), [target]));

    if (!sourceNode || !targetNode) return null;

    const sourceCenter = nodeCenter(sourceNode);
    const targetCenter = nodeCenter(targetNode);

    const sp = getNodeIntersection(sourceNode, targetCenter);
    const tp = getNodeIntersection(targetNode, sourceCenter);

    // Use a canonical direction (lexicographic node ID) for the perpendicular so
    // that A→B and B→A share the same reference axis and their offsets push them
    // to truly opposite sides instead of the same side.
    const [refA, refB] = source < target
        ? [sourceCenter, targetCenter]
        : [targetCenter, sourceCenter];
    const dx = refB.x - refA.x;
    const dy = refB.y - refA.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = (-dy / len) * (data?.edgeOffset ?? 0);
    const py = (dx / len) * (data?.edgeOffset ?? 0);

    // Quadratic bezier: control point is the midpoint shifted perpendicularly.
    // When offset = 0 this is a straight line; otherwise it arcs to one side.
    const cx = (sp.x + tp.x) / 2 + px;
    const cy = (sp.y + tp.y) / 2 + py;
    const edgePath = `M ${sp.x} ${sp.y} Q ${cx} ${cy} ${tp.x} ${tp.y}`;

    // Midpoint of the quadratic bezier at t=0.5: B(0.5) = 0.25·P0 + 0.5·P1 + 0.25·P2
    const labelX = 0.25 * sp.x + 0.5 * cx + 0.25 * tp.x;
    const labelY = 0.25 * sp.y + 0.5 * cy + 0.25 * tp.y;

    return (
        <>
            <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
            <EdgeLabelRenderer>
                <div
                    className="nodrag nopan"
                    style={{
                        position: 'absolute',
                        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        pointerEvents: 'all',
                        cursor: 'pointer',
                    }}
                >
                    <img
                        src={SHIP_ICONS[data?.speed] ?? shipImg1}
                        alt={data?.speed ?? 'ship'}
                        style={{ width: 60, height: 60, objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))' }}
                    />
                </div>
            </EdgeLabelRenderer>
        </>
    );
};

// ── Node and edge type registries ────────────────────────────────────────────

// Custom planet node
const PlanetNode = ({ data, selected }) => (
    <div className={`planet-node${selected ? ' selected' : ''}`}>
        {/* Minimal hidden handles — required by React Flow so edges can attach */}
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
        <div className="planet-node-image">
            <img src={data.image} alt={data.displayName} />
        </div>
        <div className="planet-node-label">
            <span className="planet-node-name">{data.displayName}</span>
            <span className="planet-node-type">{data.typeLabel}</span>
        </div>
    </div>
);

const nodeTypes = { planet: PlanetNode };
const edgeTypes = { floating: FloatingEdge };

// ── Data builders ────────────────────────────────────────────────────────────

const buildNodes = (planets) =>
    planets.map((planet, idx) => {
        const fallback = PLANET_ROSTER[idx % PLANET_ROSTER.length];
        const visuals = PLANET_VISUALS[planet.id] || {};
        const pos = PLANET_POSITIONS[planet.id] || { x: idx * 200, y: 0 };
        return {
            id: planet.id,
            type: 'planet',
            position: pos,
            data: {
                displayName: planet.displayName || visuals.displayName || fallback.displayName,
                typeLabel: planet.typeLabel || visuals.typeLabel || fallback.typeLabel,
                description: planet.description || visuals.description || fallback.description,
                image: visuals.image || fallback.image,
            },
            draggable: true,
        };
    });

const buildEdges = (missions) => {
    const active = missions.filter((m) => m.status !== 'terminated');

    // Group missions that share the same planet pair (regardless of direction)
    const pairGroups = {};
    active.forEach((m) => {
        const key = [m.source.id, m.destination.id].sort().join('|');
        if (!pairGroups[key]) pairGroups[key] = [];
        pairGroups[key].push(m.id);
    });

    return active.map((mission) => {
        const color = edgeColor(mission);
        const key = [mission.source.id, mission.destination.id].sort().join('|');
        const group = pairGroups[key];
        const n = group.length;
        const idx = group.indexOf(mission.id);
        // Spread edges symmetrically around the centre line:
        // n=1 → [0], n=2 → [-16, +16], n=3 → [-32, 0, +32], …
        const edgeOffset = n > 1 ? (idx - (n - 1) / 2) * EDGE_SPACING : 0;

        return {
            id: mission.id,
            source: mission.source.id,
            target: mission.destination.id,
            type: 'floating',
            animated: mission.status === 'running',
            style: { stroke: color, strokeWidth: 3 },
            markerEnd: { type: MarkerType.ArrowClosed, color },
            data: {
                speed: mission.speed,
                rps: mission.rps,
                status: mission.status,
                sourceName: mission.source.displayName,
                destName: mission.destination.displayName,
                edgeOffset,
            },
        };
    });
};

// ── Selection panel ──────────────────────────────────────────────────────────

const SelectionPanel = ({ selectedNode, selectedEdge, onClose }) => {
    if (!selectedNode && !selectedEdge) return null;

    return (
        <div className="universe-selection-panel">
            <button className="universe-selection-panel-close" onClick={onClose} aria-label="Close">
                ×
            </button>

            {selectedNode && (
                <>
                    <div className="universe-panel-planet-image">
                        <img src={selectedNode.data.image} alt={selectedNode.data.displayName} />
                    </div>
                    <div className="universe-panel-title">{selectedNode.data.displayName}</div>
                    <div className="universe-panel-subtitle">{selectedNode.data.typeLabel}</div>
                    <p className="universe-panel-description">{selectedNode.data.description}</p>
                </>
            )}

            {selectedEdge && (
                <>
                    <div className="universe-panel-subtitle" style={{ marginBottom: '0.75rem' }}>
                        Active Mission
                    </div>
                    <div className="universe-panel-route">
                        <span className="universe-panel-route-planet">{selectedEdge.data.sourceName}</span>
                        <span className="universe-panel-separator">→</span>
                        <span className="universe-panel-route-planet">{selectedEdge.data.destName}</span>
                    </div>
                    <div className="universe-panel-row">
                        <span className="universe-panel-row-label">Health</span>
                        <span
                            className="universe-panel-badge"
                            style={{
                                color: selectedEdge.data.speed === 'chaotic'
                                    ? EDGE_COLOR_ERROR
                                    : EDGE_COLOR_NORMAL,
                            }}
                        >
                            {selectedEdge.data.speed === 'chaotic' ? 'errors' : 'healthy'}
                        </span>
                    </div>
                    <div className="universe-panel-row">
                        <span className="universe-panel-row-label">Speed</span>
                        <span className="universe-panel-row-value">{selectedEdge.data.speed}</span>
                    </div>
                    <div className="universe-panel-row">
                        <span className="universe-panel-row-label">RPS</span>
                        <span className="universe-panel-row-value">{selectedEdge.data.rps}</span>
                    </div>
                    <div className="universe-panel-row">
                        <span className="universe-panel-row-label">Status</span>
                        <span className="universe-panel-row-value">{selectedEdge.data.status}</span>
                    </div>
                </>
            )}
        </div>
    );
};

// ── Main component ───────────────────────────────────────────────────────────

const UniverseMap = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedNode, setSelectedNode] = useState(null);
    const [selectedEdge, setSelectedEdge] = useState(null);
    const pollRef = useRef(null);

    const refresh = useCallback(async () => {
        try {
            const [universeData, missionsData] = await Promise.all([
                fetchUniverseConfig(),
                fetchMissions(),
            ]);

            const rawPlanets = universeData?.config?.planets || universeData?.planets || PLANET_ROSTER;
            const planets = rawPlanets.map((planet, idx) => {
                const fallback = PLANET_ROSTER[idx % PLANET_ROSTER.length];
                return { ...fallback, ...planet };
            });

            const missions = Array.isArray(missionsData)
                ? missionsData
                : (missionsData?.missions ?? []);

            // Preserve positions the user has dragged — only use the defaults for
            // nodes that don't exist in the current state yet.
            setNodes((current) => {
                const posById = Object.fromEntries(current.map((n) => [n.id, n.position]));
                return buildNodes(planets).map((n) => ({
                    ...n,
                    position: posById[n.id] ?? n.position,
                }));
            });
            setEdges(buildEdges(missions));
        } catch {
            setNodes((prev) => (prev.length === 0 ? buildNodes(PLANET_ROSTER) : prev));
        }
    }, [setNodes, setEdges]);

    useEffect(() => {
        refresh();
        pollRef.current = setInterval(refresh, POLL_INTERVAL);
        return () => clearInterval(pollRef.current);
    }, [refresh]);

    const handleNodeClick = useCallback((_, node) => {
        setSelectedEdge(null);
        setSelectedNode(node);
    }, []);

    const handleEdgeClick = useCallback((_, edge) => {
        setSelectedNode(null);
        setSelectedEdge(edge);
    }, []);

    const handlePaneClick = useCallback(() => {
        setSelectedNode(null);
        setSelectedEdge(null);
    }, []);

    return (
        <div className="universe-map-wrapper">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodeClick={handleNodeClick}
                onEdgeClick={handleEdgeClick}
                onPaneClick={handlePaneClick}
                fitView
                fitViewOptions={{ padding: 0.35 }}
                minZoom={0.3}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
            >
                <Background variant="dots" gap={24} size={1} color="#1a1f30" />
                <Controls showInteractive={false} />
            </ReactFlow>

            <SelectionPanel
                selectedNode={selectedNode}
                selectedEdge={selectedEdge}
                onClose={handlePaneClick}
            />
        </div>
    );
};

export default UniverseMap;
