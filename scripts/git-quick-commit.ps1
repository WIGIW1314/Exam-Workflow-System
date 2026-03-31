param(
  [string]$Message = "",
  [switch]$SkipPush
)

$ErrorActionPreference = "Stop"

function Ensure-Git {
  $gitCommand = Get-Command git -ErrorAction SilentlyContinue
  if ($gitCommand) {
    return $gitCommand.Source
  }

  $candidates = @(
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files\Git\bin\git.exe",
    "C:\Program Files (x86)\Git\cmd\git.exe",
    "C:\Program Files (x86)\Git\bin\git.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "Git was not found. Please install Git first."
}

$git = Ensure-Git
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$branch = & $git rev-parse --abbrev-ref HEAD
if (-not $branch) {
  throw "Current directory is not a Git repository, or the branch cannot be detected."
}

$status = & $git status --porcelain
if (-not $status) {
  Write-Host "No changes to commit."
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Message)) {
  $Message = "chore: update project $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
}

Write-Host "Staging changes..."
& $git add -A

Write-Host "Committing on branch $branch ..."
& $git commit -m $Message

if (-not $SkipPush) {
  Write-Host "Pushing to origin/$branch ..."
  & $git push origin $branch
}

Write-Host "Done."
