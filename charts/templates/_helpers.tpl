{{- define "vastaya.chart" -}}
{{ printf "%s-%s" .Chart.Name (.Chart.Version | replace "+" "_") }}
{{- end }}

{{- define "vastaya.selectorLabels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/component: {{ .component }}
app.kubernetes.io/part-of: vastaya
{{- end }}

{{- define "vastaya.standardLabels" -}}
{{ include "vastaya.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
helm.sh/chart: {{ include "vastaya.chart" .root }}
{{- end }}
