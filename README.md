# Pixel Model Presentation

A GitHub-only architectural presentation system with two interfaces:

- `admin.html`: upload a GLB model, optionally archive its SKP source, capture and rename camera views, attach notes, publish, copy a client link, and export its QR code.
- `view.html?id=project-id`: public read-only model presentation with curated views, architect notes, and GitHub-backed client discussion threads.

## Important format note

Browsers cannot render SketchUp `.skp` files directly. Export a `.glb` presentation file from SketchUp and optionally upload the original `.skp` as an archived source file.

## GitHub setup

1. Create a repository and add this project.
2. In **Settings → Pages**, select **GitHub Actions** as the source.
3. Create a fine-grained personal access token restricted to this repository with:
   - Contents: Read and write
4. Open `admin.html` on the deployed Pages site and enter the token. The token is kept only in the current browser tab.

Each publish creates or updates:

```text
public/projects/<project-id>/project.json
public/projects/<project-id>/model.glb
public/projects/<project-id>/source.skp   # optional
```

The commit triggers the included Pages deployment workflow.

## Client comments

The first client who starts a discussion for a saved view creates its GitHub Issue. Existing comments then appear inside the client viewer. GitHub sign-in is required to create or comment on a discussion. Anonymous comments need an external database or serverless backend and are intentionally not included in this GitHub-only version.

## Local development

```bash
npm install
npm run dev
```

Production validation:

```bash
npm run build
```
