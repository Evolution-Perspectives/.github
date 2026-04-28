Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$reusablePath = Join-Path $repoRoot ".github/workflows/projects-estimation-rollup-action.yml"
$triggerPath = Join-Path $repoRoot ".github/workflows/projects-estimation-rollup.yml"
$templatePath = Join-Path $repoRoot ".github/workflow-templates/projects-estimation-rollup.yml"
$templateMetadataPath = Join-Path $repoRoot ".github/workflow-templates/projects-estimation-rollup.properties.json"

$requiredFiles = @($reusablePath, $triggerPath, $templatePath, $templateMetadataPath)
foreach ($file in $requiredFiles) {
  if (-not (Test-Path $file)) {
    throw "Missing required file: $file"
  }
}

$expectedTriggerReusableRef = "./.github/workflows/projects-estimation-rollup-action.yml"
$expectedTemplateReusableRef = "Evolution-Perspectives/.github/.github/workflows/projects-estimation-rollup-action.yml@main"

$triggerContent = Get-Content -LiteralPath $triggerPath -Raw
$templateContent = Get-Content -LiteralPath $templatePath -Raw

if ($triggerContent -notmatch [Regex]::Escape($expectedTriggerReusableRef)) {
  throw "Trigger workflow does not reference expected reusable workflow: $expectedTriggerReusableRef"
}

if ($templateContent -notmatch [Regex]::Escape($expectedTemplateReusableRef)) {
  throw "Template workflow does not reference expected reusable workflow: $expectedTemplateReusableRef"
}

Write-Host "Reference integrity validated for projects-estimation-rollup artifacts."
