{{/*
Expand the name of the chart.
*/}}
{{- define "cloudvault.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "cloudvault.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "cloudvault.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "cloudvault.labels" -}}
helm.sh/chart: {{ include "cloudvault.chart" . }}
{{ include "cloudvault.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "cloudvault.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cloudvault.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "cloudvault.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "cloudvault.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Get PostgreSQL host
*/}}
{{- define "cloudvault.postgresql.host" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "%s-postgresql" (include "cloudvault.fullname" .) }}
{{- else }}
{{- .Values.externalDatabase.host }}
{{- end }}
{{- end }}

{{/*
Get PostgreSQL port
*/}}
{{- define "cloudvault.postgresql.port" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "5432" }}
{{- else }}
{{- .Values.externalDatabase.port | toString }}
{{- end }}
{{- end }}

{{/*
Get PostgreSQL database
*/}}
{{- define "cloudvault.postgresql.database" -}}
{{- if .Values.postgresql.enabled }}
{{- .Values.postgresql.auth.database }}
{{- else }}
{{- .Values.externalDatabase.database }}
{{- end }}
{{- end }}

{{/*
Get PostgreSQL username
*/}}
{{- define "cloudvault.postgresql.username" -}}
{{- if .Values.postgresql.enabled }}
{{- .Values.postgresql.auth.username }}
{{- else }}
{{- .Values.externalDatabase.username }}
{{- end }}
{{- end }}

{{/*
Get PostgreSQL secret name
*/}}
{{- define "cloudvault.postgresql.secretName" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "%s-postgresql" (include "cloudvault.fullname" .) }}
{{- else if .Values.externalDatabase.existingSecret }}
{{- .Values.externalDatabase.existingSecret }}
{{- else }}
{{- printf "%s-external-db" (include "cloudvault.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Get PostgreSQL password key in secret
*/}}
{{- define "cloudvault.postgresql.passwordKey" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "POSTGRES_PASSWORD" }}
{{- else if .Values.externalDatabase.existingSecret }}
{{- .Values.externalDatabase.existingSecretKey }}
{{- else }}
{{- printf "password" }}
{{- end }}
{{- end }}
