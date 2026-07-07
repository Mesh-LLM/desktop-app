# UI refresh screenshots

Evidence captured from the mocked Playwright experience after the orange/meshier refresh.

- `welcome.jpg` — current Welcome / global mesh entry screen; deployed on GitHub Pages as `docs/assets/mesh1.jpg`.
- `main-chat.jpg` — current running mesh chat screen; deployed on GitHub Pages as `docs/assets/mesh2.jpg`.
- `og-image.png` — current Open Graph preview image; deployed on GitHub Pages as `docs/assets/mesh.png`.

Capture command used from the repo root:

```sh
. bin/activate-hermit
npm --prefix ui run build
# temporary Playwright mocked capture spec at ui/e2e/mocked/update-pages-screenshots.tmp.spec.ts
(cd ui && npm exec -- playwright test e2e/mocked/update-pages-screenshots.tmp.spec.ts --project=mocked)
```
