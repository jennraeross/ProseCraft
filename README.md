# ProseCraft
## Outline. Write. Publish.

![Writing Screen](<Screenshots/1.26.57 PM.png>)

### Overview
Prosecraft is a novel-writing app, with tools for outlining, storyboarding, and organizing your writing. When you feel your project is ready, export it into a variety of formats with granular control.

This application is built with AI, on a base of Tauri, Typescript, and Svelte.

To build it yourself, clone the repo, enter it's directory and run `npm install && npm run tauri build`

### Creating a release

Commit and push the GitHub Actions release workflow before the first release. With a clean
working tree on the branch you want to release, run one of:

```sh
npm run release -- patch
npm run release -- minor
npm run release -- major
```

The command increments the version in the frontend and Tauri manifests, creates a release
commit and `vX.Y.Z` tag, and pushes both to `origin`. The tag triggers the installer builds
and GitHub Release publication. Use this command for releases rather than changing the
version files and pushing a commit separately. If the push fails, the command prints the
atomic push command to retry after resolving the Git error. It also verifies that the commit
and tag reached `origin`. Add `--dry-run` to check the proposed version without changing
files or pushing.

If GitHub cancels a build because a hosted runner could not be allocated, retry the tagged
release from the Actions workflow:

```sh
gh workflow run release.yml --ref main -f release_tag=vX.Y.Z
```

Replace `vX.Y.Z` with the existing release tag. This reruns all platform builds and publishes
the release once they succeed.

![Outlining](<Screenshots/1.27.03 PM.png>)
![Storyboarding](<Screenshots/1.27.36 PM.png>)
![Publishing](<Screenshots/1.27.58 PM.png>)

### Roadmap

#### Outlining
- [x] Chapter by chapter Outline mode
- [x] Storyboarding mode
- [x] Freeform pannable storyboard canvas
- [x] Basic storyboard diagrams (lines, arrows, boxes, and adjustable-size text) with pan tool
- [x] Full timeline support
- [ ] Image support

#### Writing
- [x] Rich text editor
- [x] Chapter and Scene based organization
- [x] Trash with restoration
- [x] Optional Markdown source editor
- [x] Image support
- [x] Character templates
- [x] Place templates
- [x] Folders for notes
- [x] Universal file binder
- [x] Typewriter mode
- [x] Focus mode
- [x] Zen mode
- [x] Split view (the editor plus up to four read-only reference panes)
- [x] LaTeX math (MathJax)
- [x] Mermaid
- [ ] MathCAD
- [ ] Wiki previews

#### Publishing
- [x] Basic export (PDF, DOCX, Epub, Markdown, HTML, Plain Text)
- [x] Paginated & Non-Paginated Preview
- [x] Preset style support
- [x] Custom style support
- [x] Front matter
- [x] Back matter
- [x] TOC
- [x] Cover
- [x] Front matter and Back matter in preview

#### Backup & Sync
- [x] Unencrypted backup
- [x] Encrypted backup
- [x] Sync via external folder
- [x] Sync as a single encrypted file
- [x] Open Markdown + JSON folder sync
- [x] Basic conflict resolution
- [ ] More advanced syncing (such as for mobile)
- [x] Human legible folder

#### Application
- [x] Font selection
- [x] Light / Dark mode
- [x] Colorscheme selection
- [x] Custom fonts
- [ ] Custom colorschemes
- [x] Import Epub as Project

#### Mobile
- [ ] Fully responsive interface (partial)
- [ ] Mobile syncing
- [ ] Touch dragging capability for chapters and cards
