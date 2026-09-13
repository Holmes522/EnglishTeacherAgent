$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'FreeDict.ps1')

function Assert-Equal($actual, $expected, [string]$message) {
    if ($actual -cne $expected) { throw "$message (expected $expected, got $actual)" }
}
function Assert-Rejected([scriptblock]$action, [string]$message) {
    $rejected = $false
    try { & $action | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw $message }
}

# Synthetic test data: no dictionary content is copied into the test suite.
$sample = @'
<!DOCTYPE TEI SYSTEM "https://invalid.example/unreachable.dtd">
<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc>
<editionStmt><edition>test-v1</edition></editionStmt>
</fileDesc></teiHeader><text><body>
<entry><form><orth>hello</orth><pron>/test/</pron></form><gramGrp><pos>n</pos></gramGrp>
<sense><cit type="trans" xml:lang="zh"><quote>测试</quote><quote> </quote></cit>
<sense><def>First synthetic gloss.</def></sense><sense><def>Second synthetic gloss.</def></sense></sense></entry>
<entry><form><orth>hello</orth></form><gramGrp><pos>v</pos></gramGrp>
<sense><cit type="trans" xml:lang="fr"><quote>test</quote></cit></sense></entry>
<entry><form><orth>empty</orth></form><sense><cit type="trans" xml:lang="zh"><quote /></cit></sense></entry>
</body></text></TEI>
'@
$index = Read-FreeDictIndex -XmlText $sample
$hit = Measure-FreeDictProbe -Index $index -Query 'ＨＥＬＬＯ'
Assert-Equal $hit.entryCount 2 'Preserve same-headword entries'
Assert-Equal $hit.chineseTranslationCount 1 'Ignore blank and non-Chinese translations'
Assert-Equal $hit.normalizedQuery 'hello' 'Apply NFKC and invariant lowercase'
Assert-Equal $hit.ambiguousTranslationGroupCount 1 'Flag multiple glosses in one translation group'
Assert-Equal $hit.entriesWithPronunciation 1 'Count unlabelled pronunciation without assuming dialect'
Assert-Equal $hit.entriesWithSourceId 0 'Do not invent source IDs'
Assert-Equal (Measure-FreeDictProbe -Index $index -Query 'missing').status 'NOT_FOUND' 'Missing is distinct from empty translation'
Assert-Equal (Measure-FreeDictProbe -Index $index -Query 'empty').status 'NO_CHINESE_TRANSLATION' 'Empty is not a usable hit'
Assert-Rejected { Read-FreeDictIndex -XmlText '<broken>' } 'Reject malformed XML'
Assert-Rejected { Read-FreeDictIndex -XmlText '<TEI xmlns="wrong"><text><body><entry /></body></text></TEI>' } 'Reject wrong TEI namespace'
Assert-Rejected { Read-FreeDictIndex -XmlText '<!DOCTYPE TEI [<!ENTITY leak SYSTEM "file:///C:/no-such-file">]><TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><entry>&leak;</entry></body></text></TEI>' } 'Reject entity references instead of resolving files'
Assert-Rejected { Read-FreeDictIndex -XmlText '<TEI />' -MaxCharacters 3 } 'Enforce document size limit'
$probes = @'
{"schemaVersion":1,"groups":[{"id":"test","probes":{"p1":"hello","p2":"missing","p3":"empty"}}],"coverageExclusions":{"p3":"negative control"}}
'@ | ConvertFrom-Json
$report = New-FreeDictReport -Index $index -Probes $probes
Assert-Equal $report.summary.probeCount 3 'Measure every probe including excluded controls'
Assert-Equal $report.summary.validInputCount 2 'Exclude only explicit negative controls'
Assert-Equal $report.summary.translationHits 1 'Count usable translations not just matched entries'
Assert-Equal $report.summary.translationHitPercent 50 'Use the valid-input denominator'
Assert-Equal $report.observations[2].includeInCoverage $false 'Keep negative controls in the detailed report'
$unknownExclusion = '{"schemaVersion":1,"groups":[{"id":"test","probes":{"p1":"hello"}}],"coverageExclusions":{"bad":"unknown ID"}}' | ConvertFrom-Json
Assert-Rejected { New-FreeDictReport -Index $index -Probes $unknownExclusion } 'Reject exclusion IDs that do not exist'
$duplicateIds = '{"schemaVersion":1,"groups":[{"id":"one","probes":{"p1":"hello"}},{"id":"two","probes":{"p1":"empty"}}],"coverageExclusions":{}}' | ConvertFrom-Json
Assert-Rejected { New-FreeDictReport -Index $index -Probes $duplicateIds } 'Reject duplicate probe IDs'
$testPath = [IO.Path]::GetTempFileName()
try {
    [IO.File]::WriteAllText($testPath, 'hello', [Text.UTF8Encoding]::new($false))
    $helloHash = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    $verified = Read-VerifiedUtf8File -Path $testPath -ExpectedSha256 $helloHash -MaxBytes 5
    Assert-Equal $verified.Text 'hello' 'Decode exactly the verified bytes'
    Assert-Equal $verified.Sha256 $helloHash 'Bind the reported hash to decoded input'
    [IO.File]::WriteAllText($testPath, 'world', [Text.UTF8Encoding]::new($false))
    Assert-Equal $verified.Text 'hello' 'A later file change cannot change the parsed snapshot'
    Assert-Rejected { Read-VerifiedUtf8File -Path $testPath -ExpectedSha256 $helloHash -MaxBytes 5 } 'Reject changed source or probe bytes'
    Assert-Rejected { Read-VerifiedUtf8File -Path $testPath -ExpectedSha256 $helloHash -MaxBytes 4 } 'Reject oversized files before reading'
} finally { Remove-Item -LiteralPath $testPath }
'FreeDict evaluator: 24 assertions passed.'
