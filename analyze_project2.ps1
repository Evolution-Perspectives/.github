$ErrorActionPreference = 'Stop'

function Get-ByPath($obj, [string]$path) {
  $cur = $obj
  foreach ($p in $path.Split('.')) {
    if ($null -eq $cur) { return $null }
    if ($cur.PSObject.Properties.Name -contains $p) { $cur = $cur.$p } else { return $null }
  }
  return $cur
}

function Resolve-ItemNodes($obj) {
  foreach ($path in @('data.organization.projectV2.items.nodes','organization.projectV2.items.nodes','projectV2.items.nodes','items.nodes','nodes')) {
    $v = Get-ByPath $obj $path
    if ($null -ne $v) { $arr = @($v); if ($arr.Count -gt 0) { return $arr } }
  }
  $arr = @($obj)
  if ($arr.Count -gt 0 -and $arr[0] -is [pscustomobject]) { return $arr }
  return @()
}

function Get-ContentType($item) {
  if ($item.content -and $item.content.__typename) { return [string]$item.content.__typename }
  if ($item.content -and $item.content.type) { return [string]$item.content.type }
  if ($item.type) { return [string]$item.type }
  return 'Unknown'
}

function Get-AssigneeCount($item) {
  if ($item.content -and $item.content.assignees -and $item.content.assignees.nodes) { return @($item.content.assignees.nodes).Count }
  if ($item.assignees -and $item.assignees.nodes) { return @($item.assignees.nodes).Count }
  if ($item.assignees) { return @($item.assignees).Count }
  return 0
}

function Get-FieldValueByName($item, [string[]]$wanted) {
  $wantedLower = $wanted | ForEach-Object { $_.ToLower() }
  foreach ($prop in $item.PSObject.Properties) {
    if ($wantedLower -contains $prop.Name.ToLower() -and $null -ne $prop.Value -and "$($prop.Value)" -ne '') { return [string]$prop.Value }
  }

  $nodes = @()
  if ($item.fieldValues) {
    if ($item.fieldValues.nodes) { $nodes = @($item.fieldValues.nodes) }
    else { $nodes = @($item.fieldValues) }
  }

  foreach ($fv in $nodes) {
    $fname = $null; $fval = $null
    if ($fv.field -and $fv.field.name) { $fname = [string]$fv.field.name }
    elseif ($fv.fieldName) { $fname = [string]$fv.fieldName }
    elseif ($fv.key) { $fname = [string]$fv.key }

    if ($fv.name) { $fval = [string]$fv.name }
    elseif ($fv.value) { $fval = [string]$fv.value }

    if ($fname -and $fval -and ($wantedLower -contains $fname.ToLower())) { return $fval }
  }
  return $null
}

function Invoke-ProjectQuery([string]$afterCursor) {
  $afterArg = if ([string]::IsNullOrWhiteSpace($afterCursor)) { 'null' } else { '"' + $afterCursor + '"' }
  $query = @"
query {
  organization(login:"Evolution-Perspectives") {
    projectV2(number:2) {
      id
      title
      shortDescription
      public
      closed
      url
      updatedAt
      views(first:50) { nodes { name layout } }
      fields(first:50) {
        totalCount
        nodes {
          __typename
          ... on ProjectV2FieldCommon { id name dataType }
          ... on ProjectV2SingleSelectField { options { id name color description } }
        }
      }
      items(first:100, after:$afterArg) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          type
          updatedAt
          content {
            __typename
            ... on Issue { id number title url state stateReason updatedAt closedAt repository { nameWithOwner } assignees(first:10){nodes{login}} }
            ... on PullRequest { id number title url state merged updatedAt closedAt mergedAt repository { nameWithOwner } assignees(first:10){nodes{login}} }
            ... on DraftIssue { id title updatedAt assignees(first:10){nodes{login}} }
          }
          fieldValues(first:30) {
            nodes {
              __typename
              ... on ProjectV2ItemFieldSingleSelectValue { field { ... on ProjectV2FieldCommon { name } } name }
            }
          }
        }
      }
    }
  }
}
"@
  gh api graphql -f query=$query | ConvertFrom-Json
}

$local = Get-Content -Raw -Path 'project2_items.json' | ConvertFrom-Json
$localItems = Resolve-ItemNodes $local

$localTotal = @($localItems).Count
$contentTypeDist = $localItems | Group-Object { Get-ContentType $_ } | Sort-Object Count -Descending | Select-Object Name, Count
$repoDist = $localItems | ForEach-Object {
  if ($_.content -and $_.content.repository -and $_.content.repository.nameWithOwner) { [string]$_.content.repository.nameWithOwner }
} | Where-Object { $_ } | Group-Object | Sort-Object Count -Descending | Select-Object -First 10 Name, Count
$statusDist = $localItems | ForEach-Object { Get-FieldValueByName $_ @('status') } | Where-Object { $_ } | Group-Object | Sort-Object Count -Descending | Select-Object Name, Count
$prioDist = $localItems | ForEach-Object { Get-FieldValueByName $_ @('prio','priority') } | Where-Object { $_ } | Group-Object | Sort-Object Count -Descending | Select-Object Name, Count
$unassignedCount = ($localItems | Where-Object { (Get-AssigneeCount $_) -eq 0 } | Measure-Object).Count
$draftIssueCount = ($localItems | Where-Object { (Get-ContentType $_) -eq 'DraftIssue' -or (Get-ContentType $_) -eq 'DRAFT_ISSUE' } | Measure-Object).Count

$first = Invoke-ProjectQuery $null
$proj = $first.data.organization.projectV2
$allItems = @($proj.items.nodes)
$hasNext = [bool]$proj.items.pageInfo.hasNextPage
$cursor = [string]$proj.items.pageInfo.endCursor
while ($hasNext) {
  $page = Invoke-ProjectQuery $cursor
  $pi = $page.data.organization.projectV2.items
  $allItems += @($pi.nodes)
  $hasNext = [bool]$pi.pageInfo.hasNextPage
  $cursor = [string]$pi.pageInfo.endCursor
}

$issuePrItems = $allItems | Where-Object { $_.content -and ($_.content.__typename -in @('Issue','PullRequest')) }
$stateDist = $issuePrItems | ForEach-Object {
  if ($_.content.__typename -eq 'PullRequest' -and $_.content.merged -eq $true) { 'PullRequest:MERGED' }
  else { "$($_.content.__typename):$($_.content.state)" }
} | Group-Object | Sort-Object Count -Descending | Select-Object Name, Count

$now = Get-Date
$fresh7 = ($allItems | Where-Object { $_.updatedAt -and ([datetime]$_.updatedAt -ge $now.AddDays(-7)) } | Measure-Object).Count
$fresh30 = ($allItems | Where-Object { $_.updatedAt -and ([datetime]$_.updatedAt -ge $now.AddDays(-30)) } | Measure-Object).Count
$fresh90 = ($allItems | Where-Object { $_.updatedAt -and ([datetime]$_.updatedAt -ge $now.AddDays(-90)) } | Measure-Object).Count

$oldestOpen = $issuePrItems | Where-Object {
  if ($_.content.__typename -eq 'Issue') { $_.content.state -ne 'CLOSED' }
  elseif ($_.content.__typename -eq 'PullRequest') { ($_.content.state -ne 'CLOSED' -and $_.content.merged -ne $true) }
  else { $false }
} | ForEach-Object {
  $status = Get-FieldValueByName $_ @('status')
  [pscustomobject]@{
    Type = $_.content.__typename
    UpdatedAt = [datetime]$_.updatedAt
    Title = $_.content.title
    Url = $_.content.url
    State = $_.content.state
    Status = if ($status) { $status } else { '-' }
  }
} | Sort-Object UpdatedAt | Select-Object -First 15

Write-Output '=== Project 2 Analytics (Evolution-Perspectives) ==='
Write-Output ("Project: {0} | Public: {1} | Closed: {2} | UpdatedAt: {3}" -f $proj.title, $proj.public, $proj.closed, $proj.updatedAt)
Write-Output ("URL: {0}" -f $proj.url)
Write-Output ''
Write-Output '[Local item-list payload metrics]'
Write-Output ("Total items: {0}" -f $localTotal)
Write-Output 'Content type distribution:'; $contentTypeDist | Format-Table -AutoSize | Out-String | Write-Output
Write-Output 'Top repositories by count:'; if ($repoDist) { $repoDist | Format-Table -AutoSize | Out-String | Write-Output } else { Write-Output '(none found)' }
Write-Output 'Status distribution (status):'; if ($statusDist) { $statusDist | Format-Table -AutoSize | Out-String | Write-Output } else { Write-Output '(status not present in local payload)' }
Write-Output 'Priority distribution (prio):'; if ($prioDist) { $prioDist | Format-Table -AutoSize | Out-String | Write-Output } else { Write-Output '(prio/priority not present in local payload)' }
Write-Output ("Unassigned count: {0}" -f $unassignedCount)
Write-Output ("Draft issue count: {0}" -f $draftIssueCount)
Write-Output ''
Write-Output '[GraphQL full project items metrics]'
Write-Output ("Fetched items: {0}" -f @($allItems).Count)
Write-Output 'Issue/PR state distribution:'; $stateDist | Format-Table -AutoSize | Out-String | Write-Output
Write-Output ("Updated in last 7 days:  {0}" -f $fresh7)
Write-Output ("Updated in last 30 days: {0}" -f $fresh30)
Write-Output ("Updated in last 90 days: {0}" -f $fresh90)
Write-Output ''
Write-Output 'Top 15 oldest non-closed Issue/PR by updatedAt:'
if ($oldestOpen) { $oldestOpen | Format-Table Type, UpdatedAt, State, Status, Title, Url -AutoSize | Out-String | Write-Output } else { Write-Output '(none)' }
Write-Output 'Caveats: Local JSON field names may differ (status/prio inferred heuristically). Freshness uses item.updatedAt (project item timestamp), not necessarily content.updatedAt.'
