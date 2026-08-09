# Desktop App Auto-Update Files

This folder is served by the backend at `/updates/` and is where the desktop
app looks for new versions (feed URL is configured in
`desktop/package.json` → `build.publish`).

To ship a new desktop app version:

1. Bump `version` in `desktop/package.json` (e.g. `1.0.1`).
2. Build and publish the installer:

   ```
   cd desktop
   npm run publish:win
   ```

3. Copy the generated files from `desktop/dist-electron/` into this folder:

   - `latest.yml`
   - `Patel AutoPrint Admin Setup <version>.exe`
   - `Patel AutoPrint Admin Setup <version>.exe.blockmap`

4. Commit and push. Render deploys, and every shop's desktop app auto-updates
   within ~15 seconds of launch (or within 4 hours while running).

NOTE: Files here are committed to the repo so they persist on Render. If you
later switch the feed to GitHub Releases or an S3 bucket, just change the
`publish.url` in `desktop/package.json` and stop committing files here.
