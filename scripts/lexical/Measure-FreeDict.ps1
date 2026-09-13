param(
    [Parameter(Mandatory)][string]$TeiPath,
    [string]$ProbesPath = (Join-Path $PSScriptRoot '../../tests/golden/lexical-probes.json')
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'FreeDict.ps1')

# Pin the inspected dataset, not just the mutable download URL or declared version.
$expectedSha256 = '76e15cbc8497b479ebd3834259d52366f051e16eca44c3b50fced7a78f191fb3'
$expectedProbeSha256 = '55e4f18d10d9f64bf585037687c8289a776678ee02e6ce88759908de662a19d1'
$source = Read-VerifiedUtf8File -Path $TeiPath -ExpectedSha256 $expectedSha256 -MaxBytes 50000000
$probes = Read-VerifiedUtf8File -Path $ProbesPath -ExpectedSha256 $expectedProbeSha256 -MaxBytes 1000000
$index = Read-FreeDictIndex -XmlText $source.Text
$report = New-FreeDictReport -Index $index -Probes ($probes.Text | ConvertFrom-Json)
if ($report.summary.probeCount -ne 100 -or $report.summary.validInputCount -ne 97) { throw 'Unexpected probe population' }
$report | Add-Member -NotePropertyName sourceSha256 -NotePropertyValue $source.Sha256
$report | Add-Member -NotePropertyName probeSha256 -NotePropertyValue $probes.Sha256
$report | ConvertTo-Json -Depth 10
