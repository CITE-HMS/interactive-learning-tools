/**
 * <confocal-pixel-tool> : interactive pixel size demo for point scanning confocals
 *
 * Attributes (all optional):
 *   heading          Title shown in the purple bar
 *   objective-src    URL of your objective drawing (SVG/PNG). Hidden if omitted.
 *   image-src        URL of a sample image to show under the grid (JPG/PNG). Omit for plain black.
 *                    Also used to generate the acquired-image preview (hidden if omitted).
 *   fov-um           Width of the full 20x field of view at zoom 1, in µm (default 620)
 *   na               Objective numerical aperture (default 0.8)
 *   emission-nm      Emission wavelength used for the resolution estimate, in nm (default 520)
 *   nyquist-factor   Samples per resolvable distance that count as Nyquist (default 2.3)
 *   zoom-min         Minimum zoom (default 1)
 *   zoom-max         Maximum zoom (default 20)
 *   zoom-start       Starting zoom (default 2)
 *   grid-group       Pixels represented by each grid square, per side (default 32)
 *
 * Colors can be overridden from the host page with CSS variables, e.g.
 *   confocal-pixel-tool { --cpt-purple: #3a6ea5; }
 */
(() => {
  // How close to the Nyquist factor still counts as "Nyquist" (0.02 = within ±2%)
  const NYQUIST_TOLERANCE = 0.02;

  // The preview is small, so real pixels (e.g. 1024 across a ~170 px wide preview)
  // would be invisible. The preview therefore shows n / PREVIEW_PIXEL_SCALE pixels
  // across. Each doubling of image size still doubles the pixel count, but the
  // pixels are enlarged so students can see them. Set to 1 for no exaggeration.
  const PREVIEW_PIXEL_SCALE = 8;

  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      :host {
        --cpt-purple: #675c8a;
        --cpt-teal: #7fd1d6;
        --cpt-grid: #4fd8d8;
        --cpt-gray: #d9d9d9;
        --cpt-text: #222;
        display: block;
        max-width: 860px;
        margin: 0 auto;
        padding: 20px;
        box-sizing: border-box;
        font-family: "Helvetica Neue", Arial, sans-serif;
        color: var(--cpt-text);
      }
      *, *::before, *::after { box-sizing: border-box; }

      h1 {
        background: var(--cpt-purple);
        color: #fff;
        font-weight: 400;
        font-size: clamp(1.1rem, 2.6vw, 1.6rem);
        text-align: center;
        margin: 0 0 28px;
        padding: 22px 20px;
        border-radius: 40px;
      }

      /* Shared column layout: .stage and .controls use the same two columns,
         so the right-hand column lines up in both rows. */
      .stage, .controls {
        display: grid;
        grid-template-columns: minmax(0, 520px) 190px;
        column-gap: 30px;
        justify-content: center;
      }
      .stage {
        row-gap: 14px;
        align-items: start;
      }

      /* Row 1: image + right-hand column.  Row 2: caption, centered under the image only. */
      .canvas-wrap { grid-column: 1; grid-row: 1; width: 100%; aspect-ratio: 1; align-self: start; }
      canvas { width: 100%; height: 100%; display: block; background: #050505; }

      /* Right-hand column is as tall as the main image:
         preview aligned to the top, objective aligned to the bottom. */
      .side {
        grid-column: 2;
        grid-row: 1;
        align-self: stretch;
        width: 190px;
        display: flex;
        flex-direction: column;
        align-items: center;   /* centers the preview and objective on the column's center line */
      }
      .preview-wrap { width: 170px; text-align: center; }
      .preview-wrap[hidden] { display: none; }
      #preview {
        width: 100%;
        height: auto;
        aspect-ratio: 1;
        display: block;
        background: #050505;
        border: 2px solid var(--cpt-grid);
      }
      .preview-label { margin-top: 6px; font-size: 0.8rem; color: #666; line-height: 1.35; }
      .objective {
        width: 120px;
        height: auto;
        margin-top: auto;   /* pushes the objective to the bottom of the column */
        padding-top: 18px;
      }
      .objective[hidden] { display: none; }

      .caption {
        grid-column: 1;
        grid-row: 2;
        margin: 0;
        font-size: 0.85rem;
        color: #666;
        text-align: center;
        min-height: 1.3em;
      }

      .controls {
        margin-top: 28px;
        text-align: center;
        align-items: start;
      }
      .controls-left {
        display: grid;
        grid-template-columns: 1fr 1.4fr;
        gap: 24px;
        align-items: start;
      }
      .controls-right { width: 190px; }
      .heading { display: block; font-size: 1.25rem; margin-bottom: 14px; }

      select {
        appearance: none;
        -webkit-appearance: none;
        background: var(--cpt-purple)
          url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='10'><path d='M1 1l7 8 7-8z' fill='white'/></svg>")
          no-repeat right 16px center;
        color: #fff;
        border: none;
        outline: none;
        border-radius: 30px;
        padding: 14px 44px 14px 24px;
        font-size: 1.1rem;
        font-family: inherit;
        cursor: pointer;
      }

      input[type=range] {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 6px;
        background: var(--cpt-gray);
        border-radius: 3px;
        outline: none;
        margin: 14px 0;
      }
      input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 26px; height: 26px; border-radius: 50%;
        background: var(--cpt-teal); cursor: pointer; border: none;
      }
      input[type=range]::-moz-range-thumb {
        width: 26px; height: 26px; border-radius: 50%;
        background: var(--cpt-teal); cursor: pointer; border: none;
      }
      input[type=range]:focus-visible::-webkit-slider-thumb { outline: 3px solid var(--cpt-purple); }
      input[type=range]:focus-visible::-moz-range-thumb     { outline: 3px solid var(--cpt-purple); }

      .sub { font-size: 0.9rem; color: #555; line-height: 1.5; min-height: 3em; }

      .readout {
        background: var(--cpt-gray);
        padding: 12px 10px;
        font-size: 1.4rem;
        font-weight: 600;
        border-radius: 3px;
      }
      .status { margin-top: 8px; font-size: 0.9rem; font-weight: 600; min-height: 1.3em; }
      .status.ok    { color: #2e8b57; }
      .status.over  { color: #b8860b; }
      .status.under { color: #c0392b; }

      /* Stack the right-hand column under the image on narrower screens */
      @media (max-width: 760px) {
        .stage, .controls { grid-template-columns: minmax(0, 1fr); }
        .controls { row-gap: 24px; }
        .side { grid-column: 1; grid-row: 3; justify-self: center; align-self: auto; }
        .objective { margin-top: 0; }
        .controls-right { justify-self: center; }
      }
      @media (max-width: 640px) {
        .controls-left { grid-template-columns: 1fr; }
      }
    </style>

    <h1 id="heading"></h1>

    <div class="stage">
      <div class="canvas-wrap"><canvas id="fov"></canvas></div>
      <div class="side">
        <div class="preview-wrap" id="previewWrap" hidden>
          <canvas id="preview"></canvas>
          <div class="preview-label" id="previewLabel"></div>
        </div>
        <img class="objective" id="objective" alt="Plan Apo 20x / 0.80 objective" hidden>
      </div>
      <p class="caption" id="caption"></p>
    </div>

    <div class="controls">
      <div class="controls-left">
        <div>
          <label class="heading" for="size">image size</label>
          <select id="size">
            <option value="256">256x256</option>
            <option value="512" selected>512x512</option>
            <option value="1024">1024x1024</option>
            <option value="2048">2048x2048</option>
          </select>
        </div>

        <div>
          <label class="heading" for="zoom">scan area</label>
          <input type="range" id="zoom" step="0.1">
          <div class="sub" id="zoomInfo"></div>
        </div>
      </div>

      <div class="controls-right">
        <span class="heading">pixel size</span>
        <div class="readout" id="pixelSize">####</div>
        <div class="status" id="status"></div>
      </div>
    </div>
  `;

  class ConfocalPixelTool extends HTMLElement {
    static get observedAttributes() {
      return ['heading', 'objective-src', 'image-src', 'fov-um', 'na', 'emission-nm',
              'nyquist-factor', 'zoom-min', 'zoom-max', 'grid-group'];
    }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).appendChild(template.content.cloneNode(true));
      const $ = (id) => this.shadowRoot.getElementById(id);
      this.el = {
        heading: $('heading'), canvas: $('fov'), objective: $('objective'),
        caption: $('caption'), size: $('size'), zoom: $('zoom'),
        zoomInfo: $('zoomInfo'), pixelSize: $('pixelSize'), status: $('status'),
        preview: $('preview'), previewWrap: $('previewWrap'), previewLabel: $('previewLabel'),
      };
      this.ctx = this.el.canvas.getContext('2d');
      // Offscreen work canvases used to average the sample down to the "detector" pixels
      this._bufA = document.createElement('canvas');
      this._bufB = document.createElement('canvas');
      this._img = null;
      this._imgSrc = null;
      this._ready = false;
    }

    /* ---------- configuration helpers ---------- */
    _num(name, fallback) {
      const v = parseFloat(this.getAttribute(name));
      return Number.isFinite(v) && v > 0 ? v : fallback;
    }
    get fovUm()          { return this._num('fov-um', 620); }
    get na()             { return this._num('na', 0.8); }
    get emissionNm()     { return this._num('emission-nm', 520); }
    get gridGroup()      { return this._num('grid-group', 32); }
    get nyquistFactor()  { return this._num('nyquist-factor', 2.3); }

    /* ---------- lifecycle ---------- */
    connectedCallback() {
      const { size, zoom, canvas, objective } = this.el;

      zoom.value = this._num('zoom-start', 2);
      this._applyConfig();

      size.addEventListener('change', () => this._update());
      zoom.addEventListener('input',  () => this._update());
      objective.addEventListener('error', () => { objective.hidden = true; });

      this._ro = new ResizeObserver(() => this._resizeCanvas());
      this._ro.observe(canvas);

      this._ready = true;
      this._resizeCanvas();
      this._update();
    }

    disconnectedCallback() {
      if (this._ro) this._ro.disconnect();
    }

    attributeChangedCallback() {
      if (!this._ready) return;
      this._applyConfig();
      this._update();
    }

    _applyConfig() {
      const { heading, objective, zoom } = this.el;
      heading.textContent = this.getAttribute('heading') ||
        'Adjusting pixel size on a point scanning confocal';

      const src = this.getAttribute('objective-src');
      if (src) { objective.src = src; objective.hidden = false; }
      else     { objective.removeAttribute('src'); objective.hidden = true; }

      zoom.min = this._num('zoom-min', 1);
      zoom.max = this._num('zoom-max', 20);

      // Sample image under the grid (only reload if the path changed)
      const imgSrc = this.getAttribute('image-src');
      if (imgSrc !== this._imgSrc) {
        this._imgSrc = imgSrc;
        this._img = null;
        if (imgSrc) {
          const img = new Image();
          img.onload  = () => { if (this._imgSrc === imgSrc) { this._img = img; this._draw(); } };
          img.onerror = () => { if (this._imgSrc === imgSrc) { this._img = null; this._draw(); } };
          img.src = imgSrc;
        }
      }
    }

    /* ---------- drawing ---------- */
    _resizeCanvas() {
      const dpr  = window.devicePixelRatio || 1;
      const rect = this.el.canvas.getBoundingClientRect();
      if (!rect.width) return;
      this.el.canvas.width  = Math.round(rect.width  * dpr);
      this.el.canvas.height = Math.round(rect.height * dpr);
      this._draw();
    }

    _draw() {
      const { canvas, size, zoom: zoomEl, caption } = this.el;
      const ctx = this.ctx;
      const W = canvas.width, H = canvas.height;
      const dpr = window.devicePixelRatio || 1;

      const n     = parseInt(size.value, 10);
      const zoom  = parseFloat(zoomEl.value);
      const group = this.gridGroup;

      // Scan area: a centered square, 1/zoom of the full field
      const side = W / zoom;
      const x0 = (W - side) / 2;
      const y0 = (H - side) / 2;

      // Full field of view (black, or the sample image if one is loaded)
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, W, H);

      const img = this._img;
      const hasImg = !!(img && img.complete && img.naturalWidth);
      if (hasImg) {
        // Center-crop to a square so non-square images aren't stretched
        const s  = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth  - s) / 2;
        const sy = (img.naturalHeight - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, 0, 0, W, H);

        // Dim everything outside the scan area so the scanned region stands out
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        ctx.rect(x0, y0, side, side);
        ctx.fill('evenodd');
      }

      // Grid: each square represents group x group pixels
      const cells = n / group;
      const cell  = side / cells;

      // When squares get too small to resolve, fade the lines out and
      // fill the scan area with a tint so it doesn't turn into mush.
      const lineAlpha = Math.min(1, Math.max(0, (cell - 2 * dpr) / (5 * dpr)));

      if (lineAlpha < 1) {
        const maxTint = hasImg ? 0.15 : 0.35;
        ctx.fillStyle = `rgba(79, 216, 216, ${maxTint * (1 - lineAlpha)})`;
        ctx.fillRect(x0, y0, side, side);
      }

      if (lineAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = lineAlpha;
        ctx.strokeStyle = '#4fd8d8';
        ctx.lineWidth = Math.max(1, 0.75 * dpr);
        ctx.beginPath();
        for (let i = 1; i < cells; i++) {
          const p = i * cell;
          ctx.moveTo(x0 + p, y0); ctx.lineTo(x0 + p, y0 + side);
          ctx.moveTo(x0, y0 + p); ctx.lineTo(x0 + side, y0 + p);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Outline of the scan area (inset so it isn't clipped at zoom 1)
      const lw = 2 * dpr;
      ctx.strokeStyle = '#4fd8d8';
      ctx.lineWidth = lw;
      ctx.strokeRect(x0 + lw / 2, y0 + lw / 2, side - lw, side - lw);

      caption.textContent =
        `Each grid square = ${group} × ${group} pixels ` +
        `(${cells} × ${cells} squares = ${n} × ${n} pixels)`;

      this._drawPreview();
    }

    /* Crop the sample to the scan area and average it down to m × m pixels.
       Halving in exact 2:1 steps is a true 2×2 average, so each pixel is the mean
       of the sample area it covers (like a detector pixel), with no aliasing. */
    _acquire(img, cx, cy, cs, m) {
      const k = Math.max(0, Math.ceil(Math.log2(cs / m)));
      let w = m * 2 ** k;
      let a = this._bufA, b = this._bufB;

      a.width = a.height = w;
      let c = a.getContext('2d');
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(img, cx, cy, cs, cs, 0, 0, w, w);

      while (w > m) {
        const h = w / 2;
        b.width = b.height = h;
        const bc = b.getContext('2d');
        bc.imageSmoothingEnabled = true;
        bc.imageSmoothingQuality = 'high';
        bc.drawImage(a, 0, 0, w, w, 0, 0, h, h);
        [a, b] = [b, a];
        w = h;
      }
      return a;   // m × m canvas
    }

    /* Acquired-image preview: pixelation follows the image size and scan area. */
    _drawPreview() {
      const { preview, previewWrap, previewLabel, size, zoom: zoomEl } = this.el;
      const img = this._img;
      const hasImg = !!(img && img.complete && img.naturalWidth);

      previewWrap.hidden = !hasImg;
      if (!hasImg) return;

      const n    = parseInt(size.value, 10);
      const zoom = parseFloat(zoomEl.value);
      const dpr  = window.devicePixelRatio || 1;

      // Match the preview canvas to its displayed size
      const px = Math.round(preview.getBoundingClientRect().width * dpr);
      if (!px) return;
      if (preview.width !== px) { preview.width = px; preview.height = px; }

      // Same square crop used for the full field of view in _draw()
      const s  = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth  - s) / 2;
      const sy = (img.naturalHeight - s) / 2;

      // The scan area is the centered 1/zoom portion of that square
      const cs = s / zoom;
      const cx = sx + (s - cs) / 2;
      const cy = sy + (s - cs) / 2;

      // Number of pixels shown across the preview (see PREVIEW_PIXEL_SCALE)
      const m = Math.max(8, Math.round(n / PREVIEW_PIXEL_SCALE));

      const acq = this._acquire(img, cx, cy, cs, m);

      // Enlarge with hard edges so each acquired pixel appears as a visible block
      const pctx = preview.getContext('2d');
      pctx.imageSmoothingEnabled = m > px;
      pctx.drawImage(acq, 0, 0, m, m, 0, 0, px, px);

      previewLabel.innerHTML = PREVIEW_PIXEL_SCALE > 1
        ? `acquired image <br>(pixels enlarged ${PREVIEW_PIXEL_SCALE}× for display)`
        : `acquired image`;
    }

    /* ---------- readouts ---------- */
    _fmtLength(um) {
      return um < 1 ? `${Math.round(um * 1000)} nm` : `${um.toFixed(2)} µm`;
    }

    _update() {
      const { size, zoom: zoomEl, zoomInfo, pixelSize, status } = this.el;
      const n    = parseInt(size.value, 10);
      const zoom = parseFloat(zoomEl.value);

      const areaUm  = this.fovUm / zoom;
      const pixelUm = areaUm / n;

      zoomInfo.innerHTML =
        `zoom ${zoom.toFixed(1)}× · scan area ${areaUm.toFixed(0)} × ${areaUm.toFixed(0)} µm<br>` +
        `full field of view ${this.fovUm} × ${this.fovUm} µm`;

      pixelSize.textContent = this._fmtLength(pixelUm);

      // Nyquist is defined here as nyquistFactor (2.3) pixels per airy radius.
      const resolutionNm = (0.61 * this.emissionNm) / this.na;   // Rayleigh criterion
      const ratio  = resolutionNm / (pixelUm * 1000);
      const target = this.nyquistFactor;

      let label, cls;
      if (ratio < target * (1 - NYQUIST_TOLERANCE)) {
        label = 'Undersampled';      cls = 'under';
      } else if (ratio > target * (1 + NYQUIST_TOLERANCE)) {
        label = 'Oversampled';       cls = 'over';
      } else {
        label = 'Nyquist sampling';  cls = 'ok';
      }
      status.textContent = `${label} (${ratio.toFixed(1)}×)`;
      status.className = `status ${cls}`;

      this._draw();
    }
  }

  if (!customElements.get('confocal-pixel-tool')) {
    customElements.define('confocal-pixel-tool', ConfocalPixelTool);
  }
})();