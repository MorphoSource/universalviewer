import { IIIFEvents } from "../../IIIFEvents";
import { BaseExtension } from "../../modules/uv-shared-module/BaseExtension";
import { Bookmark } from "../../modules/uv-shared-module/Bookmark";
import { DownloadDialogue } from "./DownloadDialogue";
import { FooterPanel } from "../../modules/uv-shared-module/FooterPanel";
import { FooterPanel as MobileFooterPanel } from "../../modules/uv-modelviewermobilefooterpanel-module/MobileFooter";
import { HeaderPanel } from "../../modules/uv-shared-module/HeaderPanel";
import { HelpDialogue } from "../../modules/uv-dialogues-module/HelpDialogue";
import { MoreInfoDialogue } from "../../modules/uv-dialogues-module/MoreInfoDialogue";
import { MoreInfoRightPanel } from "../../modules/uv-moreinforightpanel-module/MoreInfoRightPanel";
import { SettingsDialogue } from "./SettingsDialogue";
import { ShareDialogue } from "./ShareDialogue";
import { ExternalResourceType } from "@iiif/vocabulary/dist-commonjs/";
import { Strings, Bools } from "@edsilv/utils";
import { Canvas, LanguageMap } from "manifesto.js";
import { AlephR3FExtensionEvents } from "./Events";
import { Orbit } from "./Orbit";
import "./theme/theme.less";
import defaultConfig from "./config/config.json";
import { AnnotationGroup } from "@iiif/manifold";
import { AnnotationResults } from "../../modules/uv-shared-module/AnnotationResults";
import { Config } from "./config/Config";
import { AlephR3FCenterPanel } from "../../modules/uv-aleph-r3f-centerpanel-module/AlephR3FCenterPanel";
import { AlephR3FLeftPanel } from "../../modules/uv-aleph-r3f-leftpanel-module/AlephR3FLeftPanel";

export default class AlephR3FExtension extends BaseExtension<Config> {
  $downloadDialogue: JQuery;
  $shareDialogue: JQuery;
  $helpDialogue: JQuery;
  $moreInfoDialogue: JQuery;
  $settingsDialogue: JQuery;
  centerPanel: AlephR3FCenterPanel;
  downloadDialogue: DownloadDialogue;
  footerPanel: FooterPanel<Config["modules"]["footerPanel"]>;
  headerPanel: HeaderPanel<Config["modules"]["headerPanel"]>;
  helpDialogue: HelpDialogue;
  leftPanel: AlephR3FLeftPanel;
  mobileFooterPanel: FooterPanel<Config["modules"]["footerPanel"]>;
  moreInfoDialogue: MoreInfoDialogue;
  rightPanel: MoreInfoRightPanel;
  settingsDialogue: SettingsDialogue;
  shareDialogue: ShareDialogue;
  defaultConfig: Config = defaultConfig;
  locales = {
    "en-GB": defaultConfig,
  };

  create(): void {
    super.create();

    this.extensionHost.subscribe(
      IIIFEvents.CANVAS_INDEX_CHANGE,
      (canvasIndex: number) => {
        this.viewCanvas(canvasIndex);
      }
    );

    this.extensionHost.subscribe(
      IIIFEvents.THUMB_SELECTED,
      (canvasIndex: number) => {
        this.extensionHost.publish(IIIFEvents.CANVAS_INDEX_CHANGE, canvasIndex);
      }
    );

    // Communication between UV and Aleph-r3f by wiring together JS events and UV PubSub events
    // Aleph-r3f listens for JS event JSONEMITREQUEST and triggers JS event JSONEMIT in response

    // When UV PubSub event JSONEMITREQUEST is received, emit it as JS event
    this.extensionHost.subscribe(
      AlephR3FExtensionEvents.JSONEMITREQUEST,
      () => {
        console.log('emit request received in UV');
        window.dispatchEvent(new Event(AlephR3FExtensionEvents.JSONEMITREQUEST));
      }
    );

    // When JS event JSONEMIT is received, publish it through UV PubSub
    window.addEventListener(AlephR3FExtensionEvents.JSONEMIT, (e: any) => {
      console.log('emit received in JS pre-pubsub');
      this.extensionHost.publish(
        AlephR3FExtensionEvents.JSONEMIT,
        e.detail
      );
    });

    // Communication between UV and possible parent element (e.g. from iframe) via postMessage API

    /**
      The message invocation from the iframe parent looks like this:

      iframe.contentWindow.postMessage({
        type: 'aljsonemitrequest'
      }, 'http://localhost:8081');

     */

    window.addEventListener('message', (e: any) => {
      if (e.origin !== this.getAppUriBase()) return; 
        
      console.log('received message');
      console.log(e);
      if (e.data.type === AlephR3FExtensionEvents.JSONEMITREQUEST) {
        this.extensionHost.publish(AlephR3FExtensionEvents.JSONEMITREQUEST);
      }
    });

    this.extensionHost.subscribe(
      AlephR3FExtensionEvents.JSONEMIT,
      (json: any) => {
        console.log('emit received from pubsub');
        console.log('postMessage up to parent');
        window.parent.postMessage({
          type: AlephR3FExtensionEvents.JSONEMIT,
          data: json
        }, this.getAppUriBase());
      }
    ); 
  }

  createModules(): void {
    super.createModules();

    if (this.isHeaderPanelEnabled()) {
      this.headerPanel = new HeaderPanel(this.shell.$headerPanel);
    } else {
      this.shell.$headerPanel.hide();
    }

    if (this.isLeftPanelEnabled()) {
      this.leftPanel = new AlephR3FLeftPanel(this.shell.$leftPanel);
    }

    this.centerPanel = new AlephR3FCenterPanel(this.shell.$centerPanel);

    if (this.isRightPanelEnabled()) {
      this.rightPanel = new MoreInfoRightPanel(this.shell.$rightPanel);
    }

    if (this.isFooterPanelEnabled()) {
      this.footerPanel = new FooterPanel(this.shell.$footerPanel);
      this.mobileFooterPanel = new MobileFooterPanel(
        this.shell.$mobileFooterPanel
      );
    } else {
      this.shell.$footerPanel.hide();
    }

    this.$moreInfoDialogue = $(
      '<div class="overlay moreInfo" aria-hidden="true"></div>'
    );
    this.shell.$overlays.append(this.$moreInfoDialogue);
    this.moreInfoDialogue = new MoreInfoDialogue(this.$moreInfoDialogue);

    this.$downloadDialogue = $(
      '<div class="overlay download" aria-hidden="true"></div>'
    );
    this.shell.$overlays.append(this.$downloadDialogue);
    this.downloadDialogue = new DownloadDialogue(this.$downloadDialogue);

    this.$shareDialogue = $(
      '<div class="overlay share" aria-hidden="true"></div>'
    );
    this.shell.$overlays.append(this.$shareDialogue);
    this.shareDialogue = new ShareDialogue(this.$shareDialogue);

    this.$settingsDialogue = $(
      '<div class="overlay settings" aria-hidden="true"></div>'
    );
    this.shell.$overlays.append(this.$settingsDialogue);
    this.settingsDialogue = new SettingsDialogue(this.$settingsDialogue);

    if (this.isLeftPanelEnabled()) {
      this.leftPanel.init();
    } else {
      this.shell.$leftPanel.hide();
    }

    if (this.isRightPanelEnabled()) {
      this.rightPanel.init();
    } else {
      this.shell.$rightPanel.hide();
    }
  }

  render(): void {
    super.render();

    this.checkForTarget();
    this.checkForAnnotations();
  }

  checkForTarget(): void {
    if (this.data.target) {
      // Split target into canvas id and selector
      const components: string[] = this.data.target.split("#");
      const canvasId: string = components[0];

      // get canvas index of canvas id and trigger CANVAS_INDEX_CHANGE (if different)
      const index: number | null = this.helper.getCanvasIndexById(canvasId);

      if (index !== null && this.helper.canvasIndex !== index) {
        this.extensionHost.publish(IIIFEvents.CANVAS_INDEX_CHANGE, index);
      }

      // trigger SET_TARGET which sets the camera-orbit attribute in ModelViewerCenterPanel
      const selector: string = components[1];
      this.extensionHost.publish(
        IIIFEvents.SET_TARGET,
        Orbit.fromString(selector)
      );
    }
  }

  checkForAnnotations(): void {
    if (this.data.annotations) {
      // it's useful to group annotations by their target canvas
      let groupedAnnotations: AnnotationGroup[] = [];

      const annotations: any = this.data.annotations;

      if (Array.isArray(annotations)) {
        // using the Web Annotation Data Model
        groupedAnnotations = this.groupWebAnnotationsByTarget(
          this.data.annotations
        );
      }

      this.annotate(groupedAnnotations);
    }
  }

  annotate(annotations: AnnotationGroup[], terms?: string): void {
    this.annotations = annotations;

    // sort the annotations by canvasIndex
    this.annotations = annotations.sort(
      (a: AnnotationGroup, b: AnnotationGroup) => {
        return a.canvasIndex - b.canvasIndex;
      }
    );

    const annotationResults: AnnotationResults = new AnnotationResults();
    annotationResults.terms = terms;
    annotationResults.annotations = <AnnotationGroup[]>this.annotations;

    this.extensionHost.publish(IIIFEvents.ANNOTATIONS, annotationResults);

    // reload current index as it may contain annotations.
    //this.component.publish(BaseEvents.CANVAS_INDEX_CHANGE, [this.helper.canvasIndex]);
  }

  groupWebAnnotationsByTarget(annotations: any): AnnotationGroup[] {
    const groupedAnnotations: AnnotationGroup[] = [];

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i];
      const canvasId: string = annotation.target.match(/(.*)#/)[1];
      const canvasIndex: number | null = this.helper.getCanvasIndexById(
        canvasId
      );
      const annotationGroup: AnnotationGroup = new AnnotationGroup(canvasId);
      annotationGroup.canvasIndex = canvasIndex as number;

      const match: AnnotationGroup = groupedAnnotations.filter(
        (x) => x.canvasId === annotationGroup.canvasId
      )[0];

      // if there's already an annotation for that target, add a rect to it, otherwise create a new AnnotationGroup
      if (match) {
        match.addPoint3D(annotation);
      } else {
        annotationGroup.addPoint3D(annotation);
        groupedAnnotations.push(annotationGroup);
      }
    }

    return groupedAnnotations;
  }

  isLeftPanelEnabled(): boolean {
    return Bools.getBool(this.data.config!.options.leftPanelEnabled, true);
  }

  bookmark(): void {
    super.bookmark();

    const canvas: Canvas = this.helper.getCurrentCanvas();
    const bookmark: Bookmark = new Bookmark();

    bookmark.index = this.helper.canvasIndex;
    bookmark.label = <string>LanguageMap.getValue(canvas.getLabel());
    bookmark.thumb = canvas.getProperty("thumbnail");
    bookmark.title = this.helper.getLabel();
    bookmark.trackingLabel = window.trackingLabel;
    bookmark.type = ExternalResourceType.PHYSICAL_OBJECT;

    this.fire(IIIFEvents.BOOKMARK, bookmark);
  }

  getAppUriBase(): string {
    const appUri: string =
      window.location.protocol +
      "//" +
      window.location.hostname +
      (window.location.port ? ":" + window.location.port : "");

    return appUri;
  }

  getEmbedScript(template: string, width: number, height: number): string {
    const appUri: string = this.getAppUri();
    const iframeSrc: string = `${appUri}#?manifest=${this.helper.manifestUri}&c=${this.helper.collectionIndex}&m=${this.helper.manifestIndex}&cv=${this.helper.canvasIndex}`;
    const script: string = Strings.format(
      template,
      iframeSrc,
      width.toString(),
      height.toString()
    );
    return script;
  }
}
