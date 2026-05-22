$ErrorActionPreference = 'Stop'

function Get-ProjectItems {
  param(
    [string]$Org = 'Evolution-Perspectives',
    [int]$ProjectNumber = 2
  )

  $query = @"
query(`$after:String){
  organization(login:"$Org") {
    projectV2(number:$ProjectNumber) {
      items(first:100, after:`$after){
        pageInfo{hasNextPage endCursor}
        nodes {
          id
          updatedAt
          content {
            __typename
            ... on Issue {
              title url state stateReason updatedAt createdAt closedAt
              repository { nameWithOwner }
            }
            ... on PullRequest {
              title url state merged updatedAt createdAt closedAt mergedAt
              repository { nameWithOwner }
            }
            ... on DraftIssue {
              title updatedAt createdAt
            }
          }
          fieldValues(first:20){
            nodes{
              ... on ProjectV2ItemFieldSingleSelectValue {
                field { ... on ProjectV2FieldCommon { name } }
                name
              }
            }
          }
        }
      }
    }
  }
}
"@

  $all = @()
  $after = $null
  do {
    if([string]::IsNullOrEmpty($after)){
      $raw = gh api graphql -f query="$query" 2>&1
    } else {
      $raw = gh api graphql -f query="$query" -f after="$after" 2>&1
    }
    if($LASTEXITCODE -ne 0){ throw ($raw | Out-String) }
    $j = $raw | ConvertFrom-Json
    $itemsNode = $j.data.organization.projectV2.items
    $all += @($itemsNode.nodes)
    $after = $itemsNode.pageInfo.endCursor
    $hasNext = [bool]$itemsNode.pageInfo.hasNextPage
  } while ($hasNext)

  return $all
}

function Get-StatusFromItem {
  param($Item)
  $sv = @($Item.fieldValues.nodes | Where-Object {
    $_.field -and $_.field.name -eq 'Status' -and $_.name
  } | Select-Object -First 1)
  if($sv.Count -gt 0){ return [string]$sv[0].name }
  return $null
}

function Get-RecencyBucket {
  param([datetime]$UpdatedAt, [datetime]$Now)
  $days = ($Now - $UpdatedAt).TotalDays
  if($days -le 7){ return '<=7d' }
  elseif($days -le 30){ return '<=30d' }
  elseif($days -le 90){ return '<=90d' }
  else { return '>90d' }
}

$items = Get-ProjectItems
$now = Get-Date

$rows = foreach($i in $items){
  $c = $i.content
  $typename = if($c){ [string]$c.__typename } else { 'NoContent' }
  $contentUpdated = $null
  if($c -and $c.updatedAt){ $contentUpdated = [datetime]$c.updatedAt }
  elseif($i.updatedAt){ $contentUpdated = [datetime]$i.updatedAt }
  else { $contentUpdated = $now }

  [pscustomobject]@{
    itemId = $i.id
    typename = $typename
    title = if($c){ $c.title } else { $null }
    url = if($c){ $c.url } else { $null }
    repository = if($c -and $c.repository){ $c.repository.nameWithOwner } else { $null }
    issueState = if($typename -eq 'Issue'){ [string]$c.state } else { $null }
    prState = if($typename -eq 'PullRequest'){ [string]$c.state } else { $null }
    updatedAt = $contentUpdated
    projectStatus = Get-StatusFromItem -Item $i
  }
}

$typeCounts = $rows | Group-Object typename | Sort-Object Name | ForEach-Object { [pscustomobject]@{ type=$_.Name; count=$_.Count } }
$issueStateCounts = $rows | Where-Object { $_.typename -eq 'Issue' -and $_.issueState } | Group-Object issueState | Sort-Object Name | ForEach-Object { [pscustomobject]@{ state=$_.Name; count=$_.Count } }
$prStateCounts = $rows | Where-Object { $_.typename -eq 'PullRequest' -and $_.prState } | Group-Object prState | Sort-Object Name | ForEach-Object { [pscustomobject]@{ state=$_.Name; count=$_.Count } }

$recencyAll = $rows | ForEach-Object {
  [pscustomobject]@{ bucket = Get-RecencyBucket -UpdatedAt $_.updatedAt -Now $now }
} | Group-Object bucket | Sort-Object Name | ForEach-Object { [pscustomobject]@{ bucket=$_.Name; count=$_.Count } }

$openIssues = $rows | Where-Object { $_.typename -eq 'Issue' -and $_.issueState -eq 'OPEN' }
$recencyOpenIssues = $openIssues | ForEach-Object {
  [pscustomobject]@{ bucket = Get-RecencyBucket -UpdatedAt $_.updatedAt -Now $now }
} | Group-Object bucket | Sort-Object Name | ForEach-Object { [pscustomobject]@{ bucket=$_.Name; count=$_.Count } }

$openDoneCanceled = @('done','canceled','cancelled')
$closedActive = @('backlog','ready','in progress')

$openIssueDoneCanceledCount = ($rows | Where-Object {
  $_.typename -eq 'Issue' -and $_.issueState -eq 'OPEN' -and $_.projectStatus -and ($openDoneCanceled -contains $_.projectStatus.ToLower())
}).Count

$closedIssueActiveStatusCount = ($rows | Where-Object {
  $_.typename -eq 'Issue' -and $_.issueState -eq 'CLOSED' -and $_.projectStatus -and ($closedActive -contains $_.projectStatus.ToLower())
}).Count

$staleOpenIssues = $openIssues | Where-Object { ($now - $_.updatedAt).TotalDays -gt 30 } |
  Sort-Object updatedAt |
  Select-Object -First 20 @{n='repo';e={$_.repository}}, @{n='title';e={$_.title}}, @{n='url';e={$_.url}}, @{n='lastUpdated';e={$_.updatedAt.ToString('s')}}, @{n='projectStatus';e={$_.projectStatus}}

$keywordMatches = @()
$keywords = @('blocking','dependency','remove-blocking','issue close','workflow','automation')
if(Test-Path '.\\project2_items.json'){
  $localRaw = Get-Content '.\\project2_items.json' -Raw
  if($localRaw.Trim()){
    $local = $localRaw | ConvertFrom-Json
    $candidates = @()
    if($local -is [System.Collections.IEnumerable] -and -not ($local -is [string])){
      foreach($x in $local){ $candidates += $x }
    } elseif($local.items){
      $candidates += @($local.items)
    } else {
      $candidates += $local
    }

    foreach($it in $candidates){
      $title = $null; $body = $null; $url = $null; $status = $null
      if($it.title){ $title = [string]$it.title }
      elseif($it.content -and $it.content.title){ $title = [string]$it.content.title }

      if($it.body){ $body = [string]$it.body }
      elseif($it.content -and $it.content.body){ $body = [string]$it.content.body }

      if($it.url){ $url = [string]$it.url }
      elseif($it.content -and $it.content.url){ $url = [string]$it.content.url }

      if($it.status){ $status = [string]$it.status }
      elseif($it.projectStatus){ $status = [string]$it.projectStatus }
      elseif($it.fieldValues){
        $sv2 = @($it.fieldValues | Where-Object { $_.fieldName -eq 'Status' -or $_.name -eq 'Status' } | Select-Object -First 1)
        if($sv2.Count -gt 0){
          if($sv2[0].value){ $status = [string]$sv2[0].value }
          elseif($sv2[0].option){ $status = [string]$sv2[0].option }
        }
      }

      $hay = (($title,$body) -join "`n").ToLower()
      $hit = $false
      foreach($k in $keywords){ if($hay -like "*${k}*"){ $hit = $true; break } }
      if($hit){
        $keywordMatches += [pscustomobject]@{ title=$title; url=$url; status=$status }
      }
    }
  }
}

$result = [pscustomobject]@{
  metrics = [pscustomobject]@{
    totalItems = $rows.Count
    itemCountByType = $typeCounts
    issueStateCounts = $issueStateCounts
    prStateCounts = $prStateCounts
    recencyAllItems = $recencyAll
    recencyOpenIssues = $recencyOpenIssues
    openIssuesWithStatusDoneOrCanceled = $openIssueDoneCanceledCount
    closedIssuesWithStatusBacklogReadyInProgress = $closedIssueActiveStatusCount
  }
  staleOpenIssuesTop20 = $staleOpenIssues
  localKeywordMatches = $keywordMatches
}

$result | ConvertTo-Json -Depth 8
