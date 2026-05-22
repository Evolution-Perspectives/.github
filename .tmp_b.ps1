$query = @"
query {
  organization(login:"Evolution-Perspectives") {
    projectV2(number:2) {
      id
      title
      public
      closed
      updatedAt
      views(first:50){nodes{name layout}}
      fields(first:50){
        nodes{
          __typename
          ... on ProjectV2FieldCommon {name dataType}
          ... on ProjectV2SingleSelectField {name options{ name color }}
          ... on ProjectV2IterationField {name configuration {iterations {title startDate duration}}}
        }
      }
    }
  }
}
"@

$raw = $null
$errText = $null
try {
  $raw = gh api graphql -f query="$query" 2>&1
  if($LASTEXITCODE -ne 0){ throw ($raw | Out-String) }
  $g = $raw | ConvertFrom-Json
  $proj = $g.data.organization.projectV2

  $views = @($proj.views.nodes | ForEach-Object { [pscustomobject]@{ name=$_.name; layout=$_.layout } })

  $fields = @()
  foreach($f in $proj.fields.nodes){
    $row = [ordered]@{
      name = $f.name
      dataType = $f.dataType
      typeName = $f.__typename
    }
    if($f.__typename -eq 'ProjectV2SingleSelectField'){
      $row.singleSelectOptions = @($f.options | ForEach-Object { $_.name })
    }
    $fields += [pscustomobject]$row
  }

  [pscustomobject]@{
    ok = $true
    updatedAt = $proj.updatedAt
    views = $views
    fields = $fields
  } | ConvertTo-Json -Depth 8
}
catch {
  $errText = if($_.Exception){ $_.Exception.Message } else { $_ | Out-String }
  [pscustomobject]@{
    ok = $false
    failure = $errText.Trim()
  } | ConvertTo-Json -Depth 6
}
