$j = Get-Content -Raw "project2_items.json" | ConvertFrom-Json
$items = @($j.items)

function Get-Scalar([object]$v){
  if($null -eq $v){ return $null }
  if($v -is [string] -or $v -is [int] -or $v -is [long] -or $v -is [double] -or $v -is [bool] -or $v -is [datetime]){ return [string]$v }
  if($v -is [System.Collections.IEnumerable] -and -not ($v -is [string])){ return $null }
  foreach($k in @("name","title","value","text","login","number")){ if($v.PSObject.Properties.Name -contains $k -and $null -ne $v.$k){ return [string]$v.$k } }
  return ($v | ConvertTo-Json -Compress -Depth 4)
}

function Get-RepoName([object]$repo){
  if($null -eq $repo){ return "(none)" }
  if($repo -is [string]){ return $repo }
  foreach($k in @("nameWithOwner","full_name","name","repository")){ if($repo.PSObject.Properties.Name -contains $k -and $repo.$k){ return [string]$repo.$k } }
  return ($repo | ConvertTo-Json -Compress -Depth 3)
}

function Get-ArrayCount([object]$v){
  if($null -eq $v){ return 0 }
  if($v -is [string]){ return 1 }
  if($v -is [System.Collections.IEnumerable]){ return @($v).Count }
  foreach($k in @("nodes","items","users","assignees","labels")){ if($v.PSObject.Properties.Name -contains $k -and $v.$k){ return @($v.$k).Count } }
  return 1
}

function Remove-Diacritics([string]$s){
  if([string]::IsNullOrWhiteSpace($s)){ return $s }
  $norm = $s.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach($ch in $norm.ToCharArray()){
    if([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark){ [void]$sb.Append($ch) }
  }
  return $sb.ToString().Normalize([Text.NormalizationForm]::FormC)
}

function Normalize-Prio([object]$v){
  $raw = Get-Scalar $v
  if([string]::IsNullOrWhiteSpace($raw)){ return "(none)" }
  $s = (Remove-Diacritics $raw).ToLowerInvariant()
  if($s -match "urgent"){ return "Urgent" }
  if($s -match "important"){ return "Important" }
  if($s -match "planifi|planifie|planif"){ return "Planifie" }
  if($s -match "secondaire"){ return "Secondaire" }
  return $raw.Trim()
}

function Has-DateByPrefix([object]$item,[string]$prefix){
  foreach($p in $item.PSObject.Properties){
    if($p.Name -match ("(?i)^" + $prefix + "([_\s-]?date)?$")){
      $val = $p.Value
      if($null -eq $val){ continue }
      if($val -is [datetime]){ return $true }
      if($val -is [string] -and -not [string]::IsNullOrWhiteSpace($val)){
        $tmp = [datetime]::MinValue
        if([datetime]::TryParse($val, [ref]$tmp)){ return $true }
      }
    }
  }
  return $false
}

$statusCounts = $items | Group-Object {
  $candidate = if($_.PSObject.Properties.Name -contains "status"){ $_.status } elseif($_.PSObject.Properties.Name -contains "Status"){ $_.Status } else { $null }
  $s = Get-Scalar $candidate
  if([string]::IsNullOrWhiteSpace($s)){ "(none)" } else { $s }
} | Sort-Object -Property @{Expression='Count';Descending=$true}, @{Expression='Name';Descending=$false} | ForEach-Object { [pscustomobject]@{ status=$_.Name; count=$_.Count } }

$repoTop10 = $items | Group-Object { Get-RepoName $_.repository } | Sort-Object -Property @{Expression='Count';Descending=$true}, @{Expression='Name';Descending=$false} | Select-Object -First 10 | ForEach-Object { [pscustomobject]@{ repository=$_.Name; count=$_.Count } }

$withAssignees = 0
$withoutAssignees = 0
$withStartDate = 0
$withEndDate = 0
$withLabels = 0
$prioRows = @()
$customKeys = New-Object System.Collections.Generic.HashSet[string]

foreach($it in $items){
  $assignees = if($it.PSObject.Properties.Name -contains "assignees"){ $it.assignees } else { $null }
  if((Get-ArrayCount $assignees) -gt 0){ $withAssignees++ } else { $withoutAssignees++ }

  if(Has-DateByPrefix $it "start"){ $withStartDate++ }
  if(Has-DateByPrefix $it "end"){ $withEndDate++ }

  $labels = if($it.PSObject.Properties.Name -contains "labels"){ $it.labels } else { $null }
  if((Get-ArrayCount $labels) -gt 0){ $withLabels++ }

  $prio = if($it.PSObject.Properties.Name -contains "prio"){ $it.prio } elseif($it.PSObject.Properties.Name -contains "priority"){ $it.priority } else { $null }
  $prioRows += Normalize-Prio $prio

  foreach($k in $it.PSObject.Properties.Name){
    if($k -notin @("content","id","title","repository")){ [void]$customKeys.Add($k) }
  }
}

$prioCounts = $prioRows | Group-Object | Sort-Object -Property @{Expression='Count';Descending=$true}, @{Expression='Name';Descending=$false} | ForEach-Object { [pscustomobject]@{ prio=$_.Name; count=$_.Count } }

$resultA = [pscustomobject]@{
  totalItemCount = $items.Count
  statusCounts = $statusCounts
  top10Repositories = $repoTop10
  assigneeCoverage = [pscustomobject]@{ withAssignees=$withAssignees; none=$withoutAssignees }
  withStartDate = $withStartDate
  withEndDate = $withEndDate
  withLabels = $withLabels
  prioCounts = $prioCounts
  distinctCustomFieldKeys = @($customKeys | Sort-Object)
}

$resultA | ConvertTo-Json -Depth 8
