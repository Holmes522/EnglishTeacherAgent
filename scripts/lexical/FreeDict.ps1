function Read-VerifiedUtf8File {
    param([string]$Path, [string]$ExpectedSha256, [int]$MaxBytes)
    $ErrorActionPreference = 'Stop'
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        if ($stream.Length -gt $MaxBytes) { throw 'File exceeds size limit' }
        $bytes = [byte[]]::new([int]$stream.Length)
        $offset = 0
        while ($offset -lt $bytes.Length) {
            $count = $stream.Read($bytes, $offset, $bytes.Length - $offset)
            if ($count -eq 0) { throw 'File changed during reading' }
            $offset += $count
        }
        if ($stream.ReadByte() -ne -1) { throw 'File changed during reading' }
    } finally { $stream.Dispose() }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
    if ($hash -cne $ExpectedSha256) { throw 'Checksum mismatch; review source and probe versions before evaluation' }
    return [pscustomobject]@{ Text = [Text.UTF8Encoding]::new($false, $true).GetString($bytes); Sha256 = $hash }
}

function Read-FreeDictIndex {
    param([Parameter(Mandatory)][string]$XmlText, [long]$MaxCharacters = 50000000)
    $ErrorActionPreference = 'Stop'
    if ($XmlText.Length -gt $MaxCharacters) { throw 'TEI exceeds the document size limit' }
    # Ignore the package's external DTD, never load remote resources or local entities.
    # https://learn.microsoft.com/dotnet/api/system.xml.xmlreadersettings.dtdprocessing
    $settings = [System.Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [System.Xml.DtdProcessing]::Ignore
    $settings.XmlResolver = $null
    $settings.MaxCharactersInDocument = $MaxCharacters
    $textReader = [System.IO.StringReader]::new($XmlText)
    $reader = [System.Xml.XmlReader]::Create($textReader, $settings)
    $document = [System.Xml.XmlDocument]::new()
    $document.XmlResolver = $null
    try { $document.Load($reader) } finally { $reader.Dispose(); $textReader.Dispose() }
    $ns = [System.Xml.XmlNamespaceManager]::new($document.NameTable)
    $ns.AddNamespace('t', 'http://www.tei-c.org/ns/1.0')
    $entries = $document.SelectNodes('/t:TEI/t:text/t:body/t:entry', $ns)
    if ($entries.Count -eq 0) { throw 'No TEI dictionary entries found' }
    $byWord = [System.Collections.Generic.Dictionary[string,object]]::new([System.StringComparer]::Ordinal)
    foreach ($entry in $entries) {
        $headword = $entry.SelectSingleNode('t:form/t:orth', $ns)
        if ($null -eq $headword -or [string]::IsNullOrWhiteSpace($headword.InnerText)) { throw 'Entry lacks a headword' }
        $key = $headword.InnerText.Normalize([Text.NormalizationForm]::FormKC).Trim().ToLowerInvariant()
        if (-not $byWord.ContainsKey($key)) { $byWord[$key] = [System.Collections.Generic.List[object]]::new() }
        $byWord[$key].Add($entry)
    }
    $edition = $document.SelectSingleNode('/t:TEI/t:teiHeader/t:fileDesc/t:editionStmt/t:edition', $ns)
    $license = $document.SelectSingleNode('/t:TEI/t:teiHeader/t:fileDesc/t:publicationStmt/t:availability//t:ref', $ns)
    return [pscustomobject]@{
        ByWord = $byWord; Namespace = $ns; EntryCount = $entries.Count
        Edition = if ($edition) { $edition.InnerText } else { $null }
        LicenseUrl = if ($license) { $license.GetAttribute('target') } else { $null }
    }
}

function Measure-FreeDictProbe {
    param([Parameter(Mandatory)]$Index, [Parameter(Mandatory)][string]$Query)
    $key = $Query.Normalize([Text.NormalizationForm]::FormKC).Trim().ToLowerInvariant()
    $entries = if ($Index.ByWord.ContainsKey($key)) { @($Index.ByWord[$key].ToArray()) } else { @() }
    $translations = 0; $ambiguous = 0; $withPos = 0; $withPronunciation = 0; $withId = 0
    foreach ($entry in $entries) {
        if ($entry.SelectSingleNode('t:gramGrp/t:pos[normalize-space(.)!=""]', $Index.Namespace)) { $withPos++ }
        if ($entry.SelectSingleNode('t:form/t:pron[normalize-space(.)!=""]', $Index.Namespace)) { $withPronunciation++ }
        if ($entry.GetAttribute('id', 'http://www.w3.org/XML/1998/namespace')) { $withId++ }
        foreach ($sense in $entry.SelectNodes('t:sense', $Index.Namespace)) {
            $quotes = @($sense.SelectNodes('t:cit[@type="trans" and @xml:lang="zh"]/t:quote', $Index.Namespace) | Where-Object { -not [string]::IsNullOrWhiteSpace($_.InnerText) })
            $translations += $quotes.Count
            if ($quotes.Count -gt 0 -and $sense.SelectNodes('.//t:def', $Index.Namespace).Count -gt 1) { $ambiguous++ }
        }
    }
    return [pscustomobject][ordered]@{
        normalizedQuery = $key
        status = if ($entries.Count -eq 0) { 'NOT_FOUND' } elseif ($translations -eq 0) { 'NO_CHINESE_TRANSLATION' } else { 'TRANSLATION_FOUND' }
        entryCount = $entries.Count
        chineseTranslationCount = $translations
        entriesWithPartOfSpeech = $withPos
        entriesWithPronunciation = $withPronunciation
        entriesWithSourceId = $withId
        ambiguousTranslationGroupCount = $ambiguous
    }
}

function New-FreeDictReport {
    param([Parameter(Mandatory)]$Index, [Parameter(Mandatory)]$Probes)
    $ErrorActionPreference = 'Stop'
    if ($Probes.schemaVersion -ne 1 -or -not $Probes.groups -or $null -eq $Probes.coverageExclusions) { throw 'Invalid probe manifest' }
    $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    $excluded = @($Probes.coverageExclusions.psobject.Properties.Name)
    $observations = @(
        foreach ($group in $Probes.groups) {
            foreach ($probe in $group.probes.psobject.Properties) {
                if (-not $seen.Add($probe.Name) -or $probe.Value -isnot [string] -or [string]::IsNullOrWhiteSpace($probe.Value)) { throw 'Invalid or duplicate probe' }
                $result = Measure-FreeDictProbe -Index $Index -Query $probe.Value
                [pscustomobject][ordered]@{
                    probeId = $probe.Name; group = $group.id; query = $probe.Value
                    includeInCoverage = $excluded -cnotcontains $probe.Name
                    result = $result
                }
            }
        }
    )
    foreach ($id in $excluded) { if (-not $seen.Contains($id)) { throw 'Unknown exclusion ID' } }
    $valid = @($observations | Where-Object includeInCoverage)
    if ($valid.Count -eq 0) { throw 'No valid-input probes' }
    $hits = @($valid | Where-Object { $_.result.status -eq 'TRANSLATION_FOUND' }).Count
    $groupSummary = @(
        foreach ($group in ($observations | Group-Object group)) {
            $included = @($group.Group | Where-Object includeInCoverage)
            [pscustomobject]@{
                group = $group.Name; probeCount = $group.Count; validInputCount = $included.Count
                translationHits = @($included | Where-Object { $_.result.status -eq 'TRANSLATION_FOUND' }).Count
            }
        }
    )
    return [pscustomobject][ordered]@{
        schemaVersion = 1
        evaluation = 'STRUCTURAL_COVERAGE_ONLY'
        dictionaryVersion = $Index.Edition
        declaredLicenseUrl = $Index.LicenseUrl
        dictionaryEntryCount = $Index.EntryCount
        normalizedHeadwordCount = $Index.ByWord.Count
        summary = [pscustomobject][ordered]@{
            probeCount = $observations.Count; validInputCount = $valid.Count
            headwordHits = @($valid | Where-Object { $_.result.entryCount -gt 0 }).Count
            translationHits = $hits
            translationHitPercent = [Math]::Round(100.0 * $hits / $valid.Count, 2)
            ambiguousProbes = @($valid | Where-Object { $_.result.ambiguousTranslationGroupCount -gt 0 }).Count
            probesWithSourceIds = @($valid | Where-Object { $_.result.entriesWithSourceId -gt 0 }).Count
        }
        groups = $groupSummary
        observations = $observations
    }
}
