import { Annotation, Camera, Canvas, Manifest, PointSelector, SpecificResource } from "manifesto.js";
import { InitialCameraConfig, SrcObj } from "aleph-r3f";

export type AlephComment = {
  label: string;
  description?: string;
  position: [number, number, number];
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
  cameraFieldOfView?: number;
  cameraNear?: number;
  cameraFar?: number;
};

/**
 * Resolve a Camera `lookAt` value to a [x, y, z] scene coordinate.
 * Handles PointSelector, SpecificResource with PointSelector, and Annotation
 * references (resolved by matching against paintingAnnotations by id).
 */
export function resolveLookAt(
  lookAt: object | PointSelector | SpecificResource | null,
  paintingAnnotations: Annotation[]
): [number, number, number] | undefined {
  if (!lookAt) return undefined;

  if (lookAt instanceof PointSelector) {
    const loc = lookAt.getLocation();
    return [loc.x, loc.y, loc.z];
  }

  if (lookAt instanceof SpecificResource) {
    const loc = (lookAt as SpecificResource).getSelector()?.getLocation();
    return loc ? [loc.x, loc.y, loc.z] : undefined;
  }

  // Annotation reference: { id: "...", type: "Annotation" }
  const ref = lookAt as any;
  if (ref.type === 'Annotation' && ref.id) {
    const refAnno = paintingAnnotations.find(pa => pa.id === ref.id);
    if (refAnno) {
      const loc = refAnno.LookAtLocation;
      return [loc.x, loc.y, loc.z];
    }
  }

  return undefined;
}

/**
 * Normalize a decomposed Euler [x, y, z] in radians:
 * - clamp near-zero values to exactly 0
 * - correct the gimbal-lock form of a pure Y=180° rotation, which Three.js
 *   decomposes as X=-π, Y=~0, Z=-π rather than X=0, Y=π, Z=0
 */
function normalizeEuler(r: [number, number, number]): [number, number, number] {
  r = r.map((n) => Math.abs(n) <= 1e-6 ? 0 : n) as [number, number, number];
  if (r[0] === -Math.PI && r[2] === -Math.PI) {
    r[0] = 0;
    r[1] = (r[1] >= 0 ? Math.PI : -Math.PI) - r[1];
    r[2] = 0;
  }
  return r;
}

type Corners = [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];

/**
 * Parse a WKT POLYGONZ string into [TL, BL, BR, TR] scene coordinates.
 * Expected format: "POLYGONZ((x1 y1 z1, x2 y2 z2, x3 y3 z3, x4 y4 z4))"
 */
function parsePolygonZ(wkt: string): Corners | undefined {
  const match = wkt.match(/POLYGONZ\s*\(\s*\(\s*(.+?)\s*\)\s*\)/i);
  if (!match) return undefined;
  const pts = match[1].split(',').map(pt => {
    const parts = pt.trim().split(/\s+/).map(Number);
    return [parts[0], parts[1], parts[2]] as [number, number, number];
  });
  if (pts.length !== 4) return undefined;
  return pts as Corners;
}

/**
 * Compute [TL, BL, BR, TR] corners for a Canvas placed at a given TL anchor.
 * Default: top edge along +X, left edge along -Y, forward face toward +Z.
 * Canvas units map 1:1 to scene coordinate units per the spec.
 */
function defaultCanvasCorners(
  tlX: number, tlY: number, tlZ: number,
  width: number, height: number
): Corners {
  return [
    [tlX,         tlY,          tlZ],  // TL
    [tlX,         tlY - height, tlZ],  // BL
    [tlX + width, tlY - height, tlZ],  // BR
    [tlX + width, tlY,          tlZ],  // TR
  ];
}

/**
 * Extract the first image URL from a 2D Canvas's painting annotations.
 */
function extractImageUrl(canvas: Canvas): string | undefined {
  for (const anno of canvas.getContent()) {
    const bodies = anno.getBody();
    if (bodies.length > 0 && bodies[0].id) {
      return bodies[0].id;
    }
  }
  return undefined;
}

/**
 * Gather non-content (i.e. non-painting) annotations relevant to a Scene/Canvas
 * from both the Scene/Canvas's own `annotations` property and the Manifest's
 * top-level `annotations` property.
 * Manifest-level annotations are included if they target this Scene/Canvas
 * directly, or if they're activating annotations (which target another
 * Annotation, e.g. a comment, rather than the Scene/Canvas itself).
 */
export function getAllNonContentAnnotations(
  manifest: Manifest | undefined,
  canvas: Canvas
): Annotation[] {
  const manifestAnnotations = manifest?.getNonContentAnnotations() ?? [];

  const relevantManifestAnnotations = manifestAnnotations.filter((annotation) => {
    const target = annotation.getTarget();
    if (!target) return false;

    if (target.type === 'Annotation') return true;

    const targetId = target.isSpecificResource
      ? (target.getSource() as any)?.id
      : target.id;
    return targetId === canvas.id;
  });

  return [...canvas.getNonContentAnnotations(), ...relevantManifestAnnotations];
}

/**
 * Build the list of model/canvas SrcObjs from painting annotations.
 * Each model's position, rotation, and scale come from its own transforms.
 * Canvas bodies are resolved to image planes using the optional canvasResolver.
 * Camera and Light bodies are skipped.
 */
export function buildSrcs(
  paintingAnnotations: Annotation[],
  canvasResolver?: (id: string) => Canvas | null
): { srcs: SrcObj[]; rotationPreset: [number, number, number] } {
  const srcs: SrcObj[] = paintingAnnotations.map((annotation) => {
    const annotationBody = annotation.getBody()[0];
    const bodyType = annotationBody.getType();

    if (bodyType === 'model' && annotationBody.getResourceID()) {
      const srcObj: SrcObj = {
        url: annotationBody.getResourceID() as string,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      };

      const transformSet = annotationBody.getTransformSet();
      if (transformSet) {
        const { translation, rotation, scale } = transformSet;
        srcObj.position = translation.toArray().slice(0, 3) as [number, number, number];
        srcObj.rotation = normalizeEuler(rotation.toArray().slice(0, 3) as [number, number, number]);
        srcObj.scale = scale.toArray().slice(0, 3) as [number, number, number];
      }

      const target = annotation.getTarget();
      if (target.isSpecificResource) {
        const selector = (target as SpecificResource).getSelector();
        if (selector) {
          const point = selector.getLocation();
          if (point) {
            srcObj.position![0] = srcObj.position![0] + point.x;
            srcObj.position![1] = srcObj.position![1] + point.y;
            srcObj.position![2] = srcObj.position![2] + point.z;
          }
        }
      }

      return srcObj;
    }

    if (bodyType === 'canvas' && annotationBody.id && canvasResolver) {
      const resolvedCanvas = canvasResolver(annotationBody.id);
      if (!resolvedCanvas) return null;

      const imageUrl = extractImageUrl(resolvedCanvas);
      if (!imageUrl) return null;

      const canvasWidth  = resolvedCanvas.getWidth();
      const canvasHeight = resolvedCanvas.getHeight();

      let corners: Corners | undefined;

      const target = annotation.getTarget();
      if (target.isSpecificResource) {
        // Check for PolygonZSelector first (overrides all transforms)
        const rawSelectors: any[] = [].concat((target as SpecificResource).getProperty('selector') ?? []);
        const polygonSel = rawSelectors.find(s => s.type === 'PolygonZSelector');
        if (polygonSel?.value) {
          corners = parsePolygonZ(polygonSel.value as string);
        }

        // Fall back to PointSelector: places TL corner at the given point
        if (!corners) {
          const pointSel = (target as SpecificResource).getSelector();
          if (pointSel) {
            const pt = pointSel.getLocation();
            corners = defaultCanvasCorners(pt.x, pt.y, pt.z, canvasWidth, canvasHeight);
          }
        }
      }

      // Default: TL at scene origin
      if (!corners) {
        corners = defaultCanvasCorners(0, 0, 0, canvasWidth, canvasHeight);
      }

      return { url: imageUrl, type: 'canvas' as const, corners };
    }

    return null;
  }).filter((srcObj): srcObj is SrcObj => !!srcObj);

  return { srcs, rotationPreset: [0, 0, 0] };
}

/**
 * Find the first non-hidden Camera painting annotation and return its
 * configuration as an InitialCameraConfig for aleph-r3f.
 */
export function buildInitialCameraConfig(
  paintingAnnotations: Annotation[]
): InitialCameraConfig | undefined {
  for (const annotation of paintingAnnotations) {
    const body = annotation.getBody()[0];
    const bodyType = body?.getPropertyFromSelfOrSource('type');
    if (bodyType !== 'PerspectiveCamera' && bodyType !== 'OrthographicCamera') continue;

    // behavior: hidden is on the annotation, not the body
    const behavior: string[] = [].concat(annotation.getProperty('behavior') ?? []);
    if (behavior.includes('hidden')) continue;

    const cameraBody = body as Camera;
    const cfg: InitialCameraConfig = {
      cameraType: cameraBody.isPerspectiveCamera() ? 'perspective' : 'orthographic',
    };

    // Camera position: from the annotation target's PointSelector
    const target = annotation.getTarget();
    if (target.isSpecificResource) {
      const pt = (target as SpecificResource).getSelector()?.getLocation();
      if (pt) cfg.position = [pt.x, pt.y, pt.z];
    }

    cfg.target = resolveLookAt(cameraBody.getLookAt(), paintingAnnotations);

    if (cameraBody.isPerspectiveCamera()) {
      const fov = cameraBody.getFieldOfView();
      if (fov !== undefined) cfg.fieldOfView = fov;
    } else {
      const vh = cameraBody.getViewHeight();
      if (vh !== undefined) cfg.viewHeight = vh;
    }

    const near = cameraBody.getNear(); if (near !== undefined) cfg.near = near;
    const far  = cameraBody.getFar();  if (far  !== undefined) cfg.far  = far;
    const im: string[] = [].concat(cameraBody.getProperty('interactionMode') ?? []);
    if (im.length) cfg.interactionMode = im;

    return cfg;
  }

  return undefined;
}

/**
 * Whether an Annotation's body is a PerspectiveCamera/OrthographicCamera.
 */
function isCameraAnnotation(annotation: Annotation | undefined): annotation is Annotation {
  if (!annotation) return false;
  const body = annotation.getBody()[0];
  const t = body?.getPropertyFromSelfOrSource('type');
  return t === 'PerspectiveCamera' || t === 'OrthographicCamera';
}

/**
 * Fill in an AlephComment's camera fields from a resolved camera Annotation.
 * Shared by both the `scope`-shorthand and explicit `activating`-annotation
 * camera resolution paths below.
 */
function applyCameraAnnotation(
  comment: AlephComment,
  cameraAnno: Annotation,
  paintingAnnotations: Annotation[]
): void {
  // Camera position: from the camera annotation's target PointSelector
  const cameraTarget = cameraAnno.getTarget();
  if (cameraTarget.isSpecificResource) {
    const pt = (cameraTarget as SpecificResource).getSelector()?.getLocation();
    if (pt) comment.cameraPosition = [pt.x, pt.y, pt.z];
  }

  const cameraBody = cameraAnno.getBody()[0] as Camera;

  comment.cameraTarget = resolveLookAt(cameraBody.getLookAt(), paintingAnnotations);

  const fov = cameraBody.getFieldOfView();
  if (fov !== undefined) comment.cameraFieldOfView = fov;
  const near = cameraBody.getNear(); if (near !== undefined) comment.cameraNear = near;
  const far  = cameraBody.getFar();  if (far  !== undefined) comment.cameraFar  = far;
}

/**
 * Resolve the camera a comment activates via an explicit `activating`-motivation
 * Annotation: `target` references the commenting Annotation, and `body` is one
 * or more SpecificResources whose `source` references the camera's painting
 * Annotation (see IIIF Presentation 4.0 "3D Comments with Cameras").
 */
function findActivatedCamera(
  commentAnnotation: Annotation,
  activatingAnnotations: Annotation[],
  paintingAnnotations: Annotation[]
): Annotation | undefined {
  const activating = activatingAnnotations.filter(
    (a) => a.getTarget()?.id === commentAnnotation.id
  );

  for (const activatingAnno of activating) {
    for (const body of activatingAnno.getBody()) {
      if (!body.isSpecificResource()) continue;
      const source = body.getSource();
      if (!source || typeof source === 'string') continue;
      const cameraAnno = paintingAnnotations.find((pa) => pa.id === source.id);
      if (isCameraAnnotation(cameraAnno)) return cameraAnno;
    }
  }

  return undefined;
}

/**
 * Build the list of commenting annotations mapped to aleph-r3f's comment
 * format. Resolves an associated camera via either the Presentation 4 `scope`
 * shorthand (an array of annotation references directly on the comment) or an
 * explicit `activating`-motivation Annotation targeting the comment.
 */
export function buildAlephComments(
  commentingAnnotations: Annotation[],
  paintingAnnotations: Annotation[],
  activatingAnnotations: Annotation[] = []
): AlephComment[] {
  return commentingAnnotations.map((annotation) => {
    const comment: AlephComment = {
      label: '',
      position: [0, 0, 0],
    };

    // Label from TextualBody
    const body = annotation.getBody()[0];
    if (body.getType() === 'textualbody') {
      let commentValue = body.getProperty('value') || '';
      if (typeof commentValue === 'object' && 'value' in commentValue) commentValue = commentValue.value;
      comment.label = commentValue || '';
    }

    // Summary description
    const summary = annotation.getSummary();
    if (summary.getValue()) comment.description = summary.getValue()!;

    // Special case: split label on newline into label + description
    if (!comment.description) {
      const parts = comment.label.split(/\r\n|\r|\n/);
      if (parts.length > 1) {
        comment.label = parts[0];
        comment.description = parts.slice(1).join('\n');
      }
    }

    // Comment position from target PointSelector
    const target = annotation.getTarget();
    if (target.isSpecificResource) {
      const selector = (target as SpecificResource).getSelector();
      if (selector) {
        const point = selector.getLocation();
        if (point) comment.position = [point.x, point.y, point.z];
      }
    }

    // Presentation 4: scope is a top-level array of annotation references
    const scopeRefs: any[] = [].concat(annotation.getProperty('scope') ?? []);
    const cameraAnno = scopeRefs
      .filter(s => s.type === 'Annotation' && s.id)
      .map(s => paintingAnnotations.find(pa => pa.id === s.id))
      .find(isCameraAnnotation)
      ?? findActivatedCamera(annotation, activatingAnnotations, paintingAnnotations);

    if (cameraAnno) {
      applyCameraAnnotation(comment, cameraAnno, paintingAnnotations);
    }

    return comment;
  });
}
