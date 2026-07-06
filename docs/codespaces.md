# Codespaces & Dev Container setup

Glifex ships a Dev Container (`.devcontainer/devcontainer.json`) that installs
every toolchain, Docker-in-Docker (for the database track), and the GitHub CLI.
It runs identically as a local Dev Container ("Reopen in Container") or as a
GitHub Codespace.

## Machine size: 4 cores minimum

**Create the Codespace on a 4-core (16 GB) machine or larger.** The 2-core
(8 GB) option cannot build this container: bringing up the full toolchain set
compiles several runtimes in parallel, which exhausts 8 GB and hangs the build.

The container declares `"hostRequirements": { "cpus": 4 }`, so Codespaces no
longer offers the 2-core machine. If you run the Dev Container locally instead,
give Docker at least 4 CPUs and 16 GB.

## GitHub CLI: prebuilt and pre-authenticated

The `github-cli` feature installs `gh`, and Codespaces injects a scoped
`GITHUB_TOKEN` that `gh` picks up automatically — no `gh auth login` needed.
Confirm with:

```bash
gh api user -q .login      # prints your username if auth works
```

That means the whole pull-request flow works from the integrated terminal:

```bash
git checkout -b type/name
# ...work...
git push -u origin HEAD
gh pr create --fill
gh pr merge --auto --squash --delete-branch
```

If `gh` is missing (an older Codespace built before this feature landed), either
rebuild the container (**Command Palette → Codespaces: Rebuild Container**) or
install it for the session:

```bash
sudo apt-get update && sudo apt-get install -y gh
```

### Browser fallback for opening a PR

If you'd rather not use `gh`, push the branch and open the compare page — GitHub
pre-fills the PR from your commits:

```
https://github.com/Joey-Fuentes/glifex/compare/main...YOUR-BRANCH?expand=1
```

Then **Create pull request → Enable auto-merge → Squash**.

## Copying long terminal output (mobile / tablet)

Reading long output on a small screen is painful. Pipe it to a uniquely-named
temp file and open it in the editor, then copy from there. Use a single
variable so both halves point at the same file:

```bash
OUT=/tmp/out-$(date +%H%M%S)-$$.txt
your-command 2>&1 | tee "$OUT" && code "$OUT"
```
