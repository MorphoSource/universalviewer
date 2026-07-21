const $ = require("jquery");
import { Canvas, IExternalResource } from "manifesto.js";
import { sanitize } from "../../../../Utils";
import { IIIFEvents } from "../../IIIFEvents";
import { CenterPanel } from "../uv-shared-module/CenterPanel";
import { Position } from "../uv-shared-module/Position";
import { Async } from "@edsilv/utils";
import { Events } from "../../../../Events";
import { Config } from "../../extensions/uv-aleph-r3f-extension/config/Config";
import { createRoot, Root } from "react-dom/client";
import { createElement } from "react";
import { Viewer } from "aleph-r3f";
import { buildAlephComments, buildInitialCameraConfig, buildSrcs, getAllNonContentAnnotations } from "./AlephR3FIIIFAdapter";

export class AlephR3FCenterPanel extends CenterPanel<
  Config["modules"]["centerPanel"]
> {
  $viewerContainer: JQuery;
  viewerRoot: Root;

  isLoaded: boolean = false;

  constructor($element: JQuery) {
    super($element);
    this.attributionPosition = Position.BOTTOM_RIGHT;
  }

  create(): void {
    this.setConfig("centerPanel");

    super.create();

    const that = this;

    this.$viewerContainer = $('<div id="viewer"></div>');
    this.$viewerContainer.css("width", "100%");
    this.$viewerContainer.css("height", "100%");
    this.$content.prepend(this.$viewerContainer);

    this.viewerRoot = createRoot(this.$viewerContainer[0]);

    this.extensionHost.subscribe(
      IIIFEvents.OPEN_EXTERNAL_RESOURCE,
      (resources: IExternalResource[]) => {
        that.openMedia(resources);
      }
    );

    this.title = this.extension.helper.getLabel();
    if (this.title) this.$viewerContainer.addClass("has-title");

    if (this.config.options.toolbarsEnabled) {
      this.$viewerContainer.addClass("has-toolbars");
    }

    if (this.extension.data.config?.options?.footerPanelEnabled) {
      this.$viewerContainer.addClass("has-footer-panel");
    }

    if (this.extension.data.config?.options?.rightPanelEnabled) {
      this.$viewerContainer.addClass("has-right-panel");
    }
  }

  whenLoaded(cb: () => void): void {
    Async.waitFor(() => {
      return this.isLoaded;
    }, cb);
  }

  async openMedia(resources: IExternalResource[]) {
    await this.extension.getExternalResources(resources);

    const canvas: Canvas = this.extension.helper.getCurrentCanvas();
    const allAnnotations = canvas.getContent();

    const paintingAnnotations = allAnnotations.filter(
      (anno) => ([].concat(anno.getProperty('motivation')))[0] === 'painting'
    );

    const nonContentAnnotations = getAllNonContentAnnotations(this.extension.helper.manifest, canvas);

    const commentingAnnotations = nonContentAnnotations.filter(
      (anno) => ([].concat(anno.getProperty('motivation')))[0] === 'commenting'
    );

    const activatingAnnotations = nonContentAnnotations.filter(
      (anno) => ([].concat(anno.getProperty('motivation')))[0] === 'activating'
    );

    const canvasResolver = (id: string) => this.extension.helper.getCanvasById(id);
    const { srcs, rotationPreset } = buildSrcs(paintingAnnotations, canvasResolver);
    const initialCameraConfig = buildInitialCameraConfig(paintingAnnotations);
    const alephComments = buildAlephComments(commentingAnnotations, paintingAnnotations, activatingAnnotations);

    // Attach comments to the first model src
    if (alephComments.length && srcs.length) {
      srcs[0].annotations = alephComments;
    }

    // backgroundColor is a direct property of the Scene/Canvas
    const backgroundColor: string | undefined = canvas.getProperty('backgroundColor') ?? undefined;

    const extensionHost = this.$element.closest('.uv-iiif-extension-host')[0];
    if (extensionHost) {
      if (backgroundColor) {
        extensionHost.style.setProperty('--uv-background-color', backgroundColor);
      } else {
        extensionHost.style.removeProperty('--uv-background-color');
      }
    }

    this.viewerRoot.render(
      createElement(Viewer, {
        backgroundColor: backgroundColor,
        environmentMap: 'warehouse',
        initialCameraConfig: initialCameraConfig,
        rotationPreset: rotationPreset,
        src: srcs,
        onLoad: () => {
          this.resize();
        },
      })
    );

    this.extensionHost.publish(Events.EXTERNAL_RESOURCE_OPENED);
    this.extensionHost.publish(Events.LOAD);
  }

  resize() {
    super.resize();

    if (this.title) {
      this.$title.text(sanitize(this.title));
    }
  }
}
