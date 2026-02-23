"""Helpers for translating universe configuration into Kubernetes artifacts."""

from __future__ import annotations
from typing import Any, Dict, Iterable, List, Mapping, Tuple
import os
import re
import yaml

import kubernetes.client as k8s_client
import kubernetes.config as k8s_config
from kubernetes.dynamic import DynamicClient
from kubernetes.dynamic.exceptions import DynamicApiError

PLACEHOLDER_IMAGE = os.environ.get("UNIVERSE_PLANET_IMAGE","spaceport:latest")
CONTAINER_PORT = int(os.environ.get("UNIVERSE_PLANET_PORT", "8080"))
SERVICE_PORT = int(os.environ.get("UNIVERSE_PLANET_SERVICE_PORT", "80"))
NAMESPACE = os.environ.get("UNIVERSE_NAMESPACE", "vastaya")
BLACK_HOLE_JOB_IMAGE = os.environ.get("UNIVERSE_BLACK_HOLE_IMAGE", "bitnami/kubectl:1.29")
APPLY_MODE = os.environ.get("UNIVERSE_APPLY_MODE", "kubectl").strip().lower()
FLEET_API_URL = os.environ.get("UNIVERSE_FLEET_API_URL", f"http://vastaya-fleet.{NAMESPACE}:4006/api/fleet")
_DRY_RUN_MODES = {"dry-run", "skip", "manifest", "noop"}

ENV_FIELD_MAP: Dict[str, str] = {
    "crossGalaxyEnabled": "CROSS_GALAXY_ENABLED",
    "crossGalaxyMode": "CROSS_GALAXY_MODE",
    "wormholesEnabled": "WORMHOLES_ENABLED",
    "wormholeInstability": "WORMHOLE_INSTABILITY",
    "nebulaEnabled": "NEBULA_ENABLED",
    "nebulaDensity": "NEBULA_DENSITY",
    "shieldsEnabled": "SHIELDS_ENABLED",
    "blackHoleEnabled": "BLACK_HOLE_ENABLED",
    "chaosExperimentsEnabled": "CHAOS_EXPERIMENTS_ENABLED",
}


def _to_env_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def build_environment_variables(config: Mapping[str, Any], planets: List[Mapping[str, Any]]) -> List[Dict[str, str]]:
    env: List[Dict[str, str]] = []
    for key, env_name in ENV_FIELD_MAP.items():
        if key in config:
            env.append({"name": env_name, "value": _to_env_value(config[key])})
    return env


def sanitize_name(value: str, suffix: str = "") -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    slug = slug or "planet"
    return f"{slug}-{suffix}".rstrip("-") if suffix else slug


def normalize_planets(raw: Any) -> List[Dict[str, Any]]:
    planets: List[Dict[str, Any]] = []
    if not isinstance(raw, list):
        return planets
    for idx, item in enumerate(raw):
        if not isinstance(item, Mapping):
            continue
        planet_id = str(item.get("id") or f"planet-{idx + 1}")
        code = str(item.get("code") or f"P{idx + 1}")
        display = str(item.get("displayName") or planet_id.title())
        planet = {
            "id": planet_id,
            "code": code,
            "displayName": display,
            "type": str(item.get("type") or "generic"),
            "description": str(item.get("description") or ""),
        }
        planets.append(planet)
    return planets


def base_labels(planet: Mapping[str, Any], variant: str | None = None) -> Dict[str, str]:
    slug = sanitize_name(planet.get("id") or planet.get("code", "planet"))
    labels = {
        "app": "universe-planet",
        "universe.vastaya.dev/planet": slug,
    }
    if variant:
        labels["universe.vastaya.dev/version"] = variant
    return labels


def build_deployment(
    name: str,
    planet: Mapping[str, Any],
    env: Iterable[Dict[str, str]],
    shields_enabled: bool,
    variant: str | None = None,
) -> Dict[str, Any]:
    labels = base_labels(planet, variant)
    container_env = list(env)
    planet_identifier = str(planet.get("id") or planet.get("code") or "planet")
    container_env.append({"name": "PLANET_ID", "value": planet_identifier})
    container_env.append({"name": "FLEET_API_BASE_URL", "value": FLEET_API_URL})
    pod_metadata = {"labels": labels}
    if shields_enabled:
        pod_metadata["annotations"] = {"linkerd.io/inject": "enabled"}
    return {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": name, "namespace": NAMESPACE, "labels": labels},
        "spec": {
            "replicas": 1,
            "selector": {"matchLabels": labels},
            "template": {
                "metadata": pod_metadata,
                "spec": {
                    "containers": [
                        {
                            "name": "planet",
                            "image": PLACEHOLDER_IMAGE,
                            "imagePullPolicy": "IfNotPresent",
                            "ports": [{"containerPort": CONTAINER_PORT}],
                            "env": container_env,
                        }
                    ]
                },
            },
        },
    }


def build_service(name: str, planet: Mapping[str, Any]) -> Dict[str, Any]:
    labels = base_labels(planet)
    return {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {"name": name, "namespace": NAMESPACE, "labels": labels},
        "spec": {
            "selector": labels,
            "ports": [
                {
                    "name": "http",
                    "protocol": "TCP",
                    "port": SERVICE_PORT,
                    "targetPort": CONTAINER_PORT,
                }
            ],
        },
    }


def build_variant_service(name: str, planet: Mapping[str, Any], variant: str) -> Dict[str, Any]:
    labels = base_labels(planet, variant)
    return {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {"name": name, "namespace": NAMESPACE, "labels": labels},
        "spec": {
            "selector": labels,
            "ports": [
                {
                    "name": "http",
                    "protocol": "TCP",
                    "port": SERVICE_PORT,
                    "targetPort": CONTAINER_PORT,
                }
            ],
        },
    }


def build_namespace() -> Dict[str, Any]:
    return {
        "apiVersion": "v1",
        "kind": "Namespace",
        "metadata": {"name": NAMESPACE},
    }


def build_black_hole_job() -> Dict[str, Any]:
    script = (
        "set -euo pipefail\n"
        "while true; do\n"
        "  pods=($(kubectl get pods -n {ns} -l app=universe-planet -o jsonpath='{{{{.items[*].metadata.name}}}}'))\n"
        "  count=${{#pods[@]}}\n"
        "  if [[ $count -eq 0 ]]; then\n"
        '    echo "No planets available to delete"\n'
        "  else\n"
        "    target_index=$((RANDOM % count))\n"
        "    target=${{pods[$target_index]}}\n"
        '    echo "Consuming planet $target"\n'
        "    kubectl delete pod -n {ns} \"$target\" >/dev/null 2>&1 || true\n"
        "  fi\n"
        "  sleep_time=$((RANDOM % 71 + 20))\n"
        '  echo "Black hole resting for ${{sleep_time}}s"\n'
        "  sleep ${{sleep_time}}\n"
        "done\n"
    ).format(ns=NAMESPACE)
    return {
        "apiVersion": "batch/v1",
        "kind": "Job",
        "metadata": {"name": "black-hole-chaos", "namespace": NAMESPACE},
        "spec": {
            "backoffLimit": 0,
            "template": {
                "metadata": {"labels": {"app": "black-hole-chaos"}},
                "spec": {
                    "restartPolicy": "Never",
                    "containers": [
                        {
                            "name": "singularity",
                            "image": BLACK_HOLE_JOB_IMAGE,
                            "command": ["/bin/bash", "-c", script],
                        }
                    ],
                },
            },
        },
    }


def build_http_route(
    name: str,
    parent_service: str,
    v1_service: str,
    v2_service: str,
    v2_weight: int,
) -> Dict[str, Any]:
    v2_weight = max(0, min(100, v2_weight))
    v1_weight = max(0, 100 - v2_weight)
    return {
        "apiVersion": "gateway.networking.k8s.io/v1",
        "kind": "HTTPRoute",
        "metadata": {"name": name, "namespace": NAMESPACE},
        "spec": {
            "parentRefs": [
                {
                    "kind": "Service",
                    "name": parent_service,
                }
            ],
            "rules": [
                {
                    "backendRefs": [
                        {"name": v1_service, "port": SERVICE_PORT, "weight": v1_weight},
                        {"name": v2_service, "port": SERVICE_PORT, "weight": v2_weight},
                    ]
                }
            ],
        },
    }


def _k8s_dynamic_client() -> DynamicClient:
    """Return a Kubernetes DynamicClient using in-cluster config or local kubeconfig."""
    try:
        k8s_config.load_incluster_config()
    except k8s_config.ConfigException:
        k8s_config.load_kube_config()
    return DynamicClient(k8s_client.ApiClient())


def _apply_one(dyn: DynamicClient, resource: Dict[str, Any]) -> str:
    """Create or patch a single Kubernetes resource dict. Returns a status line."""
    api_version = resource.get("apiVersion", "v1")
    kind = resource.get("kind", "Unknown")
    meta = resource.get("metadata", {})
    name = meta.get("name", "?")
    namespace = meta.get("namespace")

    try:
        res_api = dyn.resources.get(api_version=api_version, kind=kind)
    except Exception as exc:
        return f"{kind}/{name} skip (unsupported): {exc}"

    try:
        res_api.get(name=name, namespace=namespace)
        res_api.patch(body=resource, name=name, namespace=namespace)
        return f"{kind}/{name} configured"
    except DynamicApiError as exc:
        if exc.status == 404:
            res_api.create(body=resource, namespace=namespace)
            return f"{kind}/{name} created"
        return f"{kind}/{name} error: {exc}"
    except Exception as exc:
        return f"{kind}/{name} error: {exc}"


def _apply_resources(resources: List[Dict[str, Any]]) -> Tuple[str, str, bool]:
    """
    Apply the rendered manifests unless UNIVERSE_APPLY_MODE disables it.

    Returns (apply_output, manifest_yaml, applied_flag).
    """
    manifest = yaml.safe_dump_all(resources, sort_keys=False)
    mode = APPLY_MODE or "kubectl"
    if mode in _DRY_RUN_MODES:
        message = f"kubectl apply skipped (UNIVERSE_APPLY_MODE={mode})."
        return message, manifest, False

    try:
        dyn = _k8s_dynamic_client()
    except Exception as exc:
        raise RuntimeError(f"Failed to initialise Kubernetes client: {exc}") from exc

    messages: List[str] = [_apply_one(dyn, r) for r in resources]
    output = "\n".join(messages)
    return output, manifest, True


def generate_apply_artifacts(config: Mapping[str, Any]) -> Dict[str, Any]:
    planets = normalize_planets(config.get("planets"))
    env = build_environment_variables(config, planets)
    shields_enabled = bool(config.get("shieldsEnabled"))
    black_hole_enabled = bool(config.get("blackHoleEnabled"))
    wormholes_enabled = bool(config.get("wormholesEnabled"))
    wormhole_instability = int(config.get("wormholeInstability") or 0)
    wormhole_split = max(0, min(100, wormhole_instability))
    wormhole_active = wormholes_enabled and wormhole_split > 0
    deployments: List[Dict[str, Any]] = []
    services: List[Dict[str, Any]] = []
    jobs: List[Dict[str, Any]] = []
    httproutes: List[Dict[str, Any]] = []
    operation_msgs: List[str] = []

    if not planets:
        operation_msgs.append("No planets in configuration; skipping workload generation.")
    else:
        for planet in planets:
            slug = sanitize_name(planet.get("id") or planet.get("code", "planet"))
            service_name = f"{slug}-service"
            services.append(build_service(service_name, planet))
            if wormhole_active:
                for variant in ("v1", "v2"):
                    deployment_name = f"{slug}-{variant}-deployment"
                    variant_service_name = f"{slug}-{variant}-service"
                    deployments.append(
                        build_deployment(deployment_name, planet, env, shields_enabled, variant)
                    )
                    services.append(build_variant_service(variant_service_name, planet, variant))
                httproutes.append(
                    build_http_route(
                        f"{slug}-wormhole-route",
                        parent_service=service_name,
                        v1_service=f"{slug}-v1-service",
                        v2_service=f"{slug}-v2-service",
                        v2_weight=wormhole_split,
                    )
                )
                operation_msgs.append(
                    f"Wormhole instability active for planet '{planet.get('displayName', slug)}' "
                    f"({100 - wormhole_split}% v1 / {wormhole_split}% v2)."
                )
            else:
                deployment_name = f"{slug}-deployment"
                deployments.append(build_deployment(deployment_name, planet, env, shields_enabled))
                operation_msgs.append(f"Prepared deployment/service for planet '{planet.get('displayName', slug)}'.")

    if black_hole_enabled:
        jobs.append(build_black_hole_job())
        operation_msgs.append("Black hole chaos job scheduled to randomly delete planets.")

    operation_msgs.insert(0, f"Configured {len(env)} environment variables for control plane.")

    kubectl_output = ""
    manifest_yaml = ""
    workloads = deployments + services + jobs + httproutes
    resources: List[Dict[str, Any]] = []
    if workloads:
        resources = [build_namespace()] + workloads
        kubectl_output, manifest_yaml, applied = _apply_resources(resources)
        operation_msgs.append(
            "Applied generated manifests." if applied else kubectl_output
        )

    return {
        "operations": operation_msgs,
        "environment": env,
        "kubectlOutput": kubectl_output,
        "manifestYaml": manifest_yaml,
    }
