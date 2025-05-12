const $ = require("jquery");
import { Annotation, AnnotationBody, Camera, Canvas, IExternalResource, PointSelector, SpecificResource, decomposeMatrix } from "manifesto.js";
import { sanitize } from "../../../../Utils";
import { IIIFEvents } from "../../IIIFEvents";
import { CenterPanel } from "../uv-shared-module/CenterPanel";
import { Position } from "../uv-shared-module/Position";
import { Async } from "@edsilv/utils";
import { Events } from "../../../../Events";
import { Config } from "../../extensions/uv-aleph-r3f-extension/config/Config";
import { createRoot, Root } from "react-dom/client";
import { createElement } from "react";
import { SrcObj, Viewer } from "aleph-r3f";

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

    let canvas: Canvas = this.extension.helper.getCurrentCanvas();
    const annotations: Annotation[] = canvas.getContent();

    const paintingAnnotations: Annotation[] = annotations.filter(
      (anno) => ([].concat(anno.getProperty('motivation')))[0] === 'painting'
    );
    const paintingAnnotationBodies: AnnotationBody[] = paintingAnnotations.map(
      (annotation) => annotation.getBody()[0]
    );

    let rotationPreset: [x: number, y: number, z: number] = [0, 0, 0];
    
    const srcs: SrcObj[] = paintingAnnotationBodies.map((annotation) => {
      if (annotation.getResourceID()) {
        const srcObj: SrcObj = {
          url: annotation.getResourceID() as string,
          position: [0, 0, 0],
          scale: [1, 1, 1]
        };

        // Process transforms 
        const matrix = annotation.getTransformMatrix();
        if (matrix) {
          const { translation, rotation, scale } = decomposeMatrix(matrix);
          // Position and scale are applied to the model and will not affect commenting annotations
          srcObj.position = translation.toArray().slice(0, 3) as [x: number, y: number, z: number];
          srcObj.scale = scale.toArray().slice(0, 3) as [x: number, y: number, z: number];

          // Rotation is applied to model-encompassing scene and will affect commenting annotations
          rotationPreset = (rotation.toArray().slice(0, 3) as [x: number, y: number, z: number]);
        }

        return srcObj;
      } else {
        return null;
      }
    }).filter((srcObj): srcObj is SrcObj => !!srcObj);

    // Special handling for decomposed rotation values 

    // Any rotation values that are very small (close to zero) are set to zero
    rotationPreset = rotationPreset.map((n) => Math.abs(n) <= 1e-6 ? 0 : n ) as [x: number, y: number, z: number];

    // Correct special case for rotation around the y-axis
    if (rotationPreset[0] === -Math.PI && rotationPreset[2] === -Math.PI) {
      rotationPreset[0] = 0;
      rotationPreset[1] = (rotationPreset[1] >= 0 ? Math.PI : -Math.PI) - rotationPreset[1];
      rotationPreset[2] = 0;
    }

    const commentingAnnotations: Annotation[] = canvas.getNonContentAnnotations().filter(
      (anno) => ([].concat(anno.getProperty('motivation')))[0] === 'commenting'
    );
    
    const alephComments = commentingAnnotations.map((annotation) => {
      const comment: {
        label: string,
        description?: string,
        position: [x: number, y: number, z: number],
        cameraPosition?: [x: number, y: number, z: number],
        cameraTarget?: [x: number, y: number, z: number]
      } = {
        label: '',
        position: [0.0, 0.0, 0.0] as [x: number, y: number, z: number]
      }

      // Comment annotation label
      const body = annotation.getBody()[0];
      if (body.getType() === 'textualbody') comment.label = body.getProperty("value") || "" ;

      // Comment annotation summary description
      const summary = annotation.getSummary();
      if (summary.getValue()) comment.description = summary.getValue()!;

      // Comment annotation position
      const target = annotation.getTarget();
      // target can either be scene reference (place at origin) or a specific resource
      // todo - handle specific scenes
      if (target.isSpecificResource) {
        const selector = (target as SpecificResource).getSelector();
        if (selector) {
          const point = selector.getLocation();
          if (point) {
            comment.position = [ point.x, point.y, point.z ];
          }
        }
      }

      // If comment annotation has scope content state cameras, use first for annotation camera properties
      const scopeContent = annotation.getScopeContent();
      const camera = scopeContent.find(anno => 
        anno?.getBody()[0]?.getPropertyFromSelfOrSource("type") === 'PerspectiveCamera' ||
        anno?.getBody()[0]?.getPropertyFromSelfOrSource("type") === 'OrthographicCamera'
      );
      if (camera) {
        // Camera position
        const cameraTarget = camera.getTarget();
        if (cameraTarget.isSpecificResource) {
          const cameraSelector = (cameraTarget as SpecificResource).getSelector();
          if (cameraSelector) {
            const cameraPosition = cameraSelector.getLocation();
            if (cameraPosition) {
              comment.cameraPosition = [ cameraPosition.x, cameraPosition.y, cameraPosition.z ];
            }
          }
        }

        // Camera target
        // For now only works with point selector, update for annotation URI
        const cameraBody = camera.getBody()[0] as Camera;
        const lookAt = cameraBody.getLookAt();
        if (lookAt instanceof PointSelector) {
          const lookAtLocation = lookAt.getLocation();
          comment.cameraTarget = [ lookAtLocation.x, lookAtLocation.y, lookAtLocation.z ];
        } else if (lookAt instanceof SpecificResource) {
          const lookAtLocation = lookAt?.getSelector()?.getLocation();
          if (lookAtLocation) {
            comment.cameraTarget = [ lookAtLocation.x, lookAtLocation.y, lookAtLocation.z ];
          }
        }
      }
      
      return comment;
    });

    // For now, if commenting annotations exist, put them on the first annotation src
    if (alephComments.length && srcs.length) {
      srcs[0].annotations = alephComments;
    }

    this.viewerRoot.render(
      createElement(Viewer, {
        environmentMap: 'warehouse',
        rotationPreset: rotationPreset,
        src: srcs,
        onLoad: (e) => {
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
