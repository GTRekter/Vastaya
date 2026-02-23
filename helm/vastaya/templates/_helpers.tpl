{{/*
Expand the name of the chart.
*/}}
{{- define "vastaya.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "vastaya.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Create component specific fullnames.
*/}}
{{- define "vastaya.componentName" -}}
{{- printf "%s-%s" (include "vastaya.fullname" .root) .component | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "vastaya.web.name" -}}
{{- include "vastaya.componentName" (dict "root" . "component" "web") -}}
{{- end -}}

{{- define "vastaya.universe.name" -}}
{{- include "vastaya.componentName" (dict "root" . "component" "universe") -}}
{{- end -}}

{{- define "vastaya.fleet.name" -}}
{{- include "vastaya.componentName" (dict "root" . "component" "fleet") -}}
{{- end -}}

{{- define "vastaya.spaceport.name" -}}
{{- include "vastaya.componentName" (dict "root" . "component" "spaceport") -}}
{{- end -}}

{{- define "vastaya.mcp.name" -}}
{{- include "vastaya.componentName" (dict "root" . "component" "mcp") -}}
{{- end -}}

{{- define "vastaya.controlTower.name" -}}
{{- include "vastaya.componentName" (dict "root" . "component" "control-tower") -}}
{{- end -}}

{{/*
Default labels shared by objects.
*/}}
{{- define "vastaya.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "vastaya.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Selector labels (immutable across releases)
*/}}
{{- define "vastaya.selectorLabels" -}}
app.kubernetes.io/name: {{ include "vastaya.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Component specific selector labels
*/}}
{{- define "vastaya.web.selectorLabels" -}}
{{ include "vastaya.selectorLabels" . }}
app.kubernetes.io/component: web
{{- end -}}

{{- define "vastaya.universe.selectorLabels" -}}
{{ include "vastaya.selectorLabels" . }}
app.kubernetes.io/component: universe
{{- end -}}

{{- define "vastaya.fleet.selectorLabels" -}}
{{ include "vastaya.selectorLabels" . }}
app.kubernetes.io/component: fleet
{{- end -}}

{{- define "vastaya.spaceport.selectorLabels" -}}
{{ include "vastaya.selectorLabels" . }}
app.kubernetes.io/component: spaceport
{{- end -}}

{{- define "vastaya.mcp.selectorLabels" -}}
{{ include "vastaya.selectorLabels" . }}
app.kubernetes.io/component: mcp
{{- end -}}

{{- define "vastaya.controlTower.selectorLabels" -}}
{{ include "vastaya.selectorLabels" . }}
app.kubernetes.io/component: control-tower
{{- end -}}

{{- define "vastaya.mcp.secretName" -}}
{{- printf "%s-secret" (include "vastaya.mcp.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "vastaya.controlTower.secretName" -}}
{{- printf "%s-secret" (include "vastaya.controlTower.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
