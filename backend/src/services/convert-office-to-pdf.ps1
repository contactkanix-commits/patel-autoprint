param(
  [Parameter(Mandatory=$true)][string]$inputFile,
  [Parameter(Mandatory=$true)][string]$outputPdf
)

$ext = [System.IO.Path]::GetExtension($inputFile).ToLower()

try {
  if ($ext -in '.docx','.doc') {
    $word = New-Object -ComObject Word.Application
    $word.Visible = [System.Reflection.Missing]::Value
    $doc = $word.Documents.Open($inputFile, $false, $true)
    $doc.SaveAs2([ref]$outputPdf, [ref]17)
    $doc.Close()
    $word.Quit()
  } elseif ($ext -in '.xlsx','.xls') {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $wb = $excel.Workbooks.Open($inputFile)
    $wb.ExportAsFixedFormat(0, $outputPdf)
    $wb.Close($false)
    $excel.Quit()
  } elseif ($ext -in '.pptx','.ppt') {
    $ppt = New-Object -ComObject PowerPoint.Application
    $pres = $ppt.Presentations.Open($inputFile, $true, $false, $false)
    $pres.SaveAs($outputPdf, 32)
    $pres.Close()
    $ppt.Quit()
  } else {
    Write-Error "Unsupported file type: $ext"
    exit 1
  }

  if (Test-Path $outputPdf) {
    Write-Output "OK:$outputPdf"
    exit 0
  } else {
    Write-Error "PDF was not created"
    exit 1
  }
} catch {
  Write-Error "Conversion failed: $_"
  exit 1
}
